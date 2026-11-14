from dataclasses import replace
from datetime import datetime
from typing import Callable
from uuid import UUID

from app.domain.submission import (
    SnapshotContext,
    SourceSnapshot,
    Submission,
    SubmissionStatus,
)
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.submission_repository import SubmissionRepository
from app.repositories.submission_snapshot_store import SubmissionSnapshotStore
from app.repositories.transaction_manager import TransactionManager


class SubmissionService:
    def __init__(
        self,
        attempt_repository: AttemptRepository,
        submission_repository: SubmissionRepository,
        snapshot_store: SubmissionSnapshotStore,
        transaction_manager: TransactionManager,
        clock: Callable[[], datetime],
        id_factory: Callable[[], UUID],
    ) -> None:
        self._attempt_repository = attempt_repository
        self._submission_repository = submission_repository
        self._snapshot_store = snapshot_store
        self._transaction_manager = transaction_manager
        self._clock = clock
        self._id_factory = id_factory

    def create_submission(
        self,
        attempt_id: UUID,
        snapshot: SourceSnapshot,
    ) -> Submission:
        submission: Submission | None = None
        snapshot_saved = False

        try:
            with self._transaction_manager.transaction():
                attempt = self._attempt_repository.get_by_id_for_update(attempt_id)
                if attempt is None:
                    raise AttemptNotFound(attempt_id)

                now = self._clock()
                sequence_number = attempt.submission_count + 1
                submission = Submission(
                    id=self._id_factory(),
                    attempt_id=attempt.id,
                    level_id=attempt.active_level_id,
                    sequence_number=sequence_number,
                    status=SubmissionStatus.RECEIVED,
                    created_at=now,
                    started_at=None,
                    completed_at=None,
                )
                self._snapshot_store.save(
                    submission,
                    snapshot,
                    SnapshotContext(
                        challenge_id=attempt.challenge_id,
                        challenge_version=attempt.challenge_version,
                    ),
                )
                snapshot_saved = True

                self._attempt_repository.update(
                    replace(
                        attempt,
                        submission_count=sequence_number,
                        updated_at=now,
                    ),
                )
                return self._submission_repository.add(submission)
        except Exception:
            if snapshot_saved and submission is not None:
                self._delete_snapshot(submission)
            raise

    def _delete_snapshot(self, submission: Submission) -> None:
        self._snapshot_store.delete(
            submission.attempt_id,
            submission.id,
        )
