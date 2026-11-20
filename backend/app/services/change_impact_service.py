from uuid import UUID

from app.domain.attempt import Attempt, LevelProgress
from app.domain.change_impact import ChangeImpact
from app.domain.challenge_level import LevelProgressStatus
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.submission_snapshot_store import SubmissionSnapshotStore
from app.services.analysis.change_impact_analyzer import ChangeImpactAnalyzer


class LevelChangeImpactUnavailable(RuntimeError):
    def __init__(self, attempt_id: UUID, level_id: str, reason: str) -> None:
        super().__init__(
            f"Change impact is unavailable for level '{level_id}' in "
            f"attempt '{attempt_id}': {reason}"
        )
        self.attempt_id = attempt_id
        self.level_id = level_id


class ChangeImpactService:
    def __init__(
        self,
        attempt_repository: AttemptRepository,
        challenge_repository: ChallengeRepository,
        snapshot_store: SubmissionSnapshotStore,
        analyzer: ChangeImpactAnalyzer,
    ) -> None:
        self._attempt_repository = attempt_repository
        self._challenge_repository = challenge_repository
        self._snapshot_store = snapshot_store
        self._analyzer = analyzer

    def get_level_impact(
        self,
        attempt_id: UUID,
        level_id: str,
    ) -> ChangeImpact:
        attempt = self._get_attempt(attempt_id)
        challenge = self._challenge_repository.get_manifest(
            attempt.challenge_id,
            attempt.challenge_version,
        )
        level_ids = tuple(level.id for level in challenge.levels)

        try:
            level_index = level_ids.index(level_id)
        except ValueError as error:
            raise LevelChangeImpactUnavailable(
                attempt_id,
                level_id,
                "the level does not exist in the pinned challenge release",
            ) from error

        if level_index == 0:
            raise LevelChangeImpactUnavailable(
                attempt_id,
                level_id,
                "the first level has no previous level to compare",
            )

        previous_level_id = level_ids[level_index - 1]
        progress_by_level_id = {
            progress.level_id: progress
            for progress in attempt.levels
        }
        current_submission_id = self._completed_submission_id(
            attempt,
            level_id,
            progress_by_level_id.get(level_id),
        )
        previous_submission_id = self._completed_submission_id(
            attempt,
            previous_level_id,
            progress_by_level_id.get(previous_level_id),
        )

        previous_snapshot = self._snapshot_store.load(
            attempt.id,
            previous_submission_id,
        )
        current_snapshot = self._snapshot_store.load(
            attempt.id,
            current_submission_id,
        )
        return self._analyzer.analyze(previous_snapshot, current_snapshot)

    def _get_attempt(self, attempt_id: UUID) -> Attempt:
        attempt = self._attempt_repository.get_by_id(attempt_id)
        if attempt is None:
            raise AttemptNotFound(attempt_id)
        return attempt

    @staticmethod
    def _completed_submission_id(
        attempt: Attempt,
        level_id: str,
        progress: LevelProgress | None,
    ) -> UUID:
        if progress is None or progress.status != LevelProgressStatus.COMPLETED:
            raise LevelChangeImpactUnavailable(
                attempt.id,
                level_id,
                "the level is not completed",
            )

        if progress.latest_passed_submission_id is None:
            raise LevelChangeImpactUnavailable(
                attempt.id,
                level_id,
                "the completed level has no source submission",
            )

        return progress.latest_passed_submission_id
