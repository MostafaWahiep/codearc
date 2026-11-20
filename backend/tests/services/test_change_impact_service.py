import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, call
from uuid import UUID, uuid4

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import (
    ChallengeLevelDefinition,
    LevelProgressStatus,
)
from app.domain.change_impact import ChangeImpact
from app.domain.submission import SourceFile, SourceSnapshot
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.submission_snapshot_store import SubmissionSnapshotStore
from app.services.analysis.change_impact_analyzer import ChangeImpactAnalyzer
from app.services.change_impact_service import (
    ChangeImpactService,
    LevelChangeImpactUnavailable,
)


class ChangeImpactServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.attempt_repository = Mock(spec=AttemptRepository)
        self.challenge_repository = Mock(spec=ChallengeRepository)
        self.snapshot_store = Mock(spec=SubmissionSnapshotStore)
        self.analyzer = Mock(spec=ChangeImpactAnalyzer)
        self.service = ChangeImpactService(
            attempt_repository=self.attempt_repository,
            challenge_repository=self.challenge_repository,
            snapshot_store=self.snapshot_store,
            analyzer=self.analyzer,
        )

    def test_compares_completed_level_with_previous_manifest_level(self) -> None:
        previous_submission_id = uuid4()
        current_submission_id = uuid4()
        attempt = self._attempt(
            levels=(
                self._completed_progress(
                    "prefix-search",
                    current_submission_id,
                ),
                self._completed_progress(
                    "single-term-search",
                    previous_submission_id,
                ),
            ),
        )
        previous_snapshot = self._snapshot("return []")
        current_snapshot = self._snapshot("return ['doc-1']")
        expected = ChangeImpact(changed_files=())
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.get_manifest.return_value = self._manifest()
        self.snapshot_store.load.side_effect = (
            previous_snapshot,
            current_snapshot,
        )
        self.analyzer.analyze.return_value = expected

        impact = self.service.get_level_impact(
            attempt.id,
            "prefix-search",
        )

        self.assertEqual(impact, expected)
        self.challenge_repository.get_manifest.assert_called_once_with(
            attempt.challenge_id,
            attempt.challenge_version,
        )
        self.assertEqual(
            self.snapshot_store.load.call_args_list,
            [
                call(attempt.id, previous_submission_id),
                call(attempt.id, current_submission_id),
            ],
        )
        self.analyzer.analyze.assert_called_once_with(
            previous_snapshot,
            current_snapshot,
        )

    def test_rejects_an_unknown_attempt(self) -> None:
        attempt_id = uuid4()
        self.attempt_repository.get_by_id.return_value = None

        with self.assertRaisesRegex(AttemptNotFound, str(attempt_id)):
            self.service.get_level_impact(attempt_id, "prefix-search")

        self.challenge_repository.get_manifest.assert_not_called()
        self.snapshot_store.load.assert_not_called()

    def test_rejects_level_outside_the_pinned_release(self) -> None:
        attempt = self._attempt()
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.get_manifest.return_value = self._manifest()

        with self.assertRaisesRegex(
            LevelChangeImpactUnavailable,
            "does not exist in the pinned challenge release",
        ):
            self.service.get_level_impact(attempt.id, "unknown-level")

        self.snapshot_store.load.assert_not_called()

    def test_rejects_first_level_because_it_has_no_comparison(self) -> None:
        attempt = self._attempt()
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.get_manifest.return_value = self._manifest()

        with self.assertRaisesRegex(
            LevelChangeImpactUnavailable,
            "first level has no previous level",
        ):
            self.service.get_level_impact(
                attempt.id,
                "single-term-search",
            )

        self.snapshot_store.load.assert_not_called()

    def test_requires_both_levels_to_be_completed(self) -> None:
        attempt = self._attempt(
            levels=(
                self._completed_progress(
                    "single-term-search",
                    uuid4(),
                ),
                LevelProgress(
                    level_id="prefix-search",
                    status=LevelProgressStatus.ACTIVE,
                    submission_count=0,
                    completed_at=None,
                ),
            ),
        )
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.get_manifest.return_value = self._manifest()

        with self.assertRaisesRegex(
            LevelChangeImpactUnavailable,
            "prefix-search.*not completed",
        ):
            self.service.get_level_impact(attempt.id, "prefix-search")

        self.snapshot_store.load.assert_not_called()

    def test_requires_completed_levels_to_reference_source_submissions(self) -> None:
        attempt = self._attempt(
            levels=(
                self._completed_progress("single-term-search", None),
                self._completed_progress("prefix-search", uuid4()),
            ),
        )
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.get_manifest.return_value = self._manifest()

        with self.assertRaisesRegex(
            LevelChangeImpactUnavailable,
            "single-term-search.*no source submission",
        ):
            self.service.get_level_impact(attempt.id, "prefix-search")

        self.snapshot_store.load.assert_not_called()

    @staticmethod
    def _attempt(
        levels: tuple[LevelProgress, ...] | None = None,
    ) -> Attempt:
        now = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)
        return Attempt(
            id=uuid4(),
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
            completed_at=None,
            active_level_id="phrase-search",
            submission_count=2,
            levels=levels or (),
        )

    @staticmethod
    def _completed_progress(
        level_id: str,
        submission_id: UUID | None,
    ) -> LevelProgress:
        return LevelProgress(
            level_id=level_id,
            status=LevelProgressStatus.COMPLETED,
            submission_count=1,
            completed_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
            latest_passed_submission_id=submission_id,
        )

    @staticmethod
    def _manifest() -> ChallengeManifest:
        return ChallengeManifest(
            id="search-engine",
            title="Search Engine",
            description="Build an evolving search engine.",
            version="1",
            starter_path="starter",
            entrypoint_path="search_engine.py",
            levels=tuple(
                ChallengeLevelDefinition(
                    id=level_id,
                    title=level_id,
                    sections=(),
                    design_feedback_path="feedback.md",
                    tests_path="tests",
                )
                for level_id in (
                    "single-term-search",
                    "prefix-search",
                    "phrase-search",
                )
            ),
        )

    @staticmethod
    def _snapshot(body: str) -> SourceSnapshot:
        return SourceSnapshot(
            files=(
                SourceFile(
                    path="search_engine.py",
                    content=f"def search():\n    {body}\n",
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
