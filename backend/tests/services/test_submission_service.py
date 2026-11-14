import unittest
from contextlib import nullcontext
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import Mock
from uuid import uuid4

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge_level import LevelProgressStatus
from app.domain.submission import (
    SnapshotContext,
    SourceFile,
    SourceSnapshot,
    SubmissionStatus,
)
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.submission_repository import SubmissionRepository
from app.repositories.submission_snapshot_store import SubmissionSnapshotStore
from app.repositories.transaction_manager import TransactionManager
from app.services.submission_service import SubmissionService


class SubmissionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.attempt_repository = Mock(spec=AttemptRepository)
        self.submission_repository = Mock(spec=SubmissionRepository)
        self.submission_repository.add.side_effect = lambda submission: submission
        self.snapshot_store = Mock(spec=SubmissionSnapshotStore)
        self.transaction_manager = Mock(spec=TransactionManager)
        self.transaction_manager.transaction.side_effect = nullcontext
        self.now = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
        self.submission_id = uuid4()
        self.service = SubmissionService(
            attempt_repository=self.attempt_repository,
            submission_repository=self.submission_repository,
            snapshot_store=self.snapshot_store,
            transaction_manager=self.transaction_manager,
            clock=lambda: self.now,
            id_factory=lambda: self.submission_id,
        )

    def test_creates_next_submission_for_active_level(self) -> None:
        attempt = self._attempt(submission_count=2)
        snapshot = self._snapshot()
        self.attempt_repository.get_by_id_for_update.return_value = attempt
        self.attempt_repository.update.side_effect = lambda updated: updated

        submission = self.service.create_submission(attempt.id, snapshot)

        self.assertEqual(submission.id, self.submission_id)
        self.assertEqual(submission.attempt_id, attempt.id)
        self.assertEqual(submission.level_id, attempt.active_level_id)
        self.assertEqual(submission.sequence_number, 3)
        self.assertEqual(submission.status, SubmissionStatus.RECEIVED)
        self.assertEqual(submission.created_at, self.now)
        self.assertIsNone(submission.started_at)
        self.assertIsNone(submission.completed_at)
        self.snapshot_store.save.assert_called_once_with(
            submission,
            snapshot,
            SnapshotContext(
                challenge_id=attempt.challenge_id,
                challenge_version=attempt.challenge_version,
            ),
        )
        updated_attempt = self.attempt_repository.update.call_args.args[0]
        self.assertEqual(updated_attempt.submission_count, 3)
        self.assertEqual(updated_attempt.updated_at, self.now)
        self.submission_repository.add.assert_called_once_with(submission)
        self.transaction_manager.transaction.assert_called_once_with()

    def test_allows_submission_for_completed_attempt(self) -> None:
        attempt = replace(
            self._attempt(),
            status=AttemptStatus.COMPLETED,
            completed_at=self.now,
        )
        self.attempt_repository.get_by_id_for_update.return_value = attempt
        self.attempt_repository.update.side_effect = lambda updated: updated

        submission = self.service.create_submission(attempt.id, self._snapshot())

        self.assertEqual(submission.level_id, attempt.active_level_id)
        self.submission_repository.add.assert_called_once_with(submission)

    def test_unknown_attempt_does_not_save_snapshot_or_submission(self) -> None:
        attempt_id = uuid4()
        self.attempt_repository.get_by_id_for_update.return_value = None

        with self.assertRaisesRegex(AttemptNotFound, str(attempt_id)):
            self.service.create_submission(attempt_id, self._snapshot())

        self.snapshot_store.save.assert_not_called()
        self.attempt_repository.update.assert_not_called()
        self.submission_repository.add.assert_not_called()

    def test_deletes_snapshot_when_database_write_fails(self) -> None:
        attempt = self._attempt()
        self.attempt_repository.get_by_id_for_update.return_value = attempt
        self.attempt_repository.update.side_effect = lambda updated: updated
        self.submission_repository.add.side_effect = RuntimeError("write failed")

        with self.assertRaisesRegex(RuntimeError, "write failed"):
            self.service.create_submission(attempt.id, self._snapshot())

        self.snapshot_store.delete.assert_called_once_with(
            attempt.id,
            self.submission_id,
        )

    @staticmethod
    def _snapshot() -> SourceSnapshot:
        return SourceSnapshot(
            files=(
                SourceFile(
                    path="search_engine.py",
                    content="class SearchEngine:\n    pass\n",
                ),
            ),
        )

    @staticmethod
    def _attempt(submission_count: int = 0) -> Attempt:
        now = datetime(2026, 11, 14, 11, tzinfo=timezone.utc)
        return Attempt(
            id=uuid4(),
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
            completed_at=None,
            active_level_id="single-term-search",
            submission_count=submission_count,
            levels=(
                LevelProgress(
                    level_id="single-term-search",
                    status=LevelProgressStatus.ACTIVE,
                    submission_count=0,
                    completed_at=None,
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
