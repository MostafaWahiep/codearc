import unittest
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import Mock
from uuid import uuid4

from app.domain.attempt import Attempt, AttemptStatus
from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import (
    ChallengeLevelDefinition,
    LevelProgressStatus,
    LoadedChallengeLevel,
)
from app.domain.level_section import LevelSection, SectionDisplay
from app.domain.test_bundle import PublicTestFile, TestCategory
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.services.attempt_service import (
    AttemptLevelNotVisible,
    AttemptService,
)


class AttemptServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.attempt_repository = Mock(spec=AttemptRepository)
        self.challenge_repository = Mock(spec=ChallengeRepository)
        self.now = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
        self.attempt_id = uuid4()
        self.service = AttemptService(
            attempt_repository=self.attempt_repository,
            challenge_repository=self.challenge_repository,
            clock=lambda: self.now,
            id_factory=lambda: self.attempt_id,
        )

    def test_starts_attempt_on_first_level_of_latest_release(self) -> None:
        user_id = uuid4()
        self.challenge_repository.get_latest_manifest.return_value = (
            self._manifest()
        )
        self.attempt_repository.add.side_effect = lambda attempt: attempt

        attempt = self.service.start_attempt(user_id, "search-engine")

        self.assertEqual(attempt.id, self.attempt_id)
        self.assertEqual(attempt.user_id, user_id)
        self.assertEqual(attempt.challenge_id, "search-engine")
        self.assertEqual(attempt.challenge_version, "10")
        self.assertEqual(attempt.status, AttemptStatus.IN_PROGRESS)
        self.assertEqual(attempt.started_at, self.now)
        self.assertEqual(attempt.updated_at, self.now)
        self.assertEqual(attempt.active_level_id, "single-term-search")
        self.assertEqual(len(attempt.levels), 1)
        self.assertEqual(attempt.levels[0].level_id, "single-term-search")
        self.assertEqual(attempt.levels[0].status, LevelProgressStatus.ACTIVE)
        self.challenge_repository.get_latest_manifest.assert_called_once_with(
            "search-engine",
        )
        self.attempt_repository.add.assert_called_once_with(attempt)

    def test_gets_existing_attempt(self) -> None:
        attempt = self._attempt()
        self.attempt_repository.get_by_id.return_value = attempt

        result = self.service.get_attempt(attempt.id)

        self.assertEqual(result, attempt)
        self.attempt_repository.get_by_id.assert_called_once_with(attempt.id)

    def test_lists_user_attempts_for_challenge_in_repository_order(self) -> None:
        user_id = uuid4()
        attempts = [self._attempt(), self._attempt()]
        self.attempt_repository.find_by_user_and_challenge.return_value = attempts

        result = self.service.list_attempts(user_id, "search-engine")

        self.assertEqual(result, attempts)
        self.attempt_repository.find_by_user_and_challenge.assert_called_once_with(
            user_id,
            "search-engine",
        )

    def test_unknown_attempt_raises_not_found(self) -> None:
        attempt_id = uuid4()
        self.attempt_repository.get_by_id.return_value = None

        with self.assertRaisesRegex(AttemptNotFound, str(attempt_id)):
            self.service.get_attempt(attempt_id)

    def test_loads_a_visible_level_from_the_pinned_release(self) -> None:
        attempt = self._attempt()
        sections = self._sections()
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.load_level.return_value = LoadedChallengeLevel(
            id="single-term-search",
            title="Level 1",
            sections=sections,
        )

        level = self.service.get_visible_level(
            attempt.id,
            "single-term-search",
        )

        self.assertEqual(level.id, "single-term-search")
        self.assertEqual(level.status, LevelProgressStatus.ACTIVE)
        self.assertEqual(level.sections, sections)
        self.assertIsNone(level.design_feedback)
        self.challenge_repository.load_level.assert_called_once_with(
            "search-engine",
            "10",
            "single-term-search",
        )
        self.challenge_repository.load_design_feedback.assert_not_called()

    def test_reveals_design_feedback_for_a_completed_visible_level(self) -> None:
        attempt = self._attempt()
        completed_progress = replace(
            attempt.levels[0],
            status=LevelProgressStatus.COMPLETED,
            completed_at=self.now,
        )
        attempt = replace(attempt, levels=(completed_progress,))
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.load_level.return_value = LoadedChallengeLevel(
            id="single-term-search",
            title="Level 1",
            sections=self._sections(),
        )
        self.challenge_repository.load_design_feedback.return_value = (
            "## Design feedback"
        )

        level = self.service.get_visible_level(
            attempt.id,
            "single-term-search",
        )

        self.assertEqual(level.status, LevelProgressStatus.COMPLETED)
        self.assertEqual(level.design_feedback, "## Design feedback")
        self.challenge_repository.load_design_feedback.assert_called_once_with(
            "search-engine",
            "10",
            "single-term-search",
        )

    def test_rejects_a_level_that_is_not_visible_in_the_attempt(self) -> None:
        attempt = self._attempt()
        self.attempt_repository.get_by_id.return_value = attempt

        with self.assertRaisesRegex(AttemptLevelNotVisible, "prefix-search"):
            self.service.get_visible_level(attempt.id, "prefix-search")

        self.challenge_repository.load_level.assert_not_called()

    def test_loads_current_and_regression_tests_for_visible_levels(self) -> None:
        attempt = self._attempt()
        completed_progress = replace(
            attempt.levels[0],
            status=LevelProgressStatus.COMPLETED,
            completed_at=self.now,
        )
        active_progress = replace(
            attempt.levels[0],
            level_id="prefix-search",
        )
        attempt = replace(
            attempt,
            active_level_id="prefix-search",
            levels=(completed_progress, active_progress),
        )
        self.attempt_repository.get_by_id.return_value = attempt
        self.challenge_repository.load_public_tests.side_effect = (
            (
                PublicTestFile(
                    level_id="single-term-search",
                    path="test_search.py",
                    content="def test_search(): pass",
                    category=TestCategory.CURRENT,
                ),
            ),
            (
                PublicTestFile(
                    level_id="prefix-search",
                    path="test_prefix.py",
                    content="def test_prefix(): pass",
                    category=TestCategory.CURRENT,
                ),
            ),
        )

        files = self.service.get_visible_tests(attempt.id)

        self.assertEqual(
            [file.category for file in files],
            [TestCategory.REGRESSION, TestCategory.CURRENT],
        )
        self.assertEqual(
            self.challenge_repository.load_public_tests.call_count,
            2,
        )

    @staticmethod
    def _manifest() -> ChallengeManifest:
        return ChallengeManifest(
            id="search-engine",
            version="10",
            title="Build a Search Engine",
            description="Description",
            starter_path="starter",
            entrypoint_path="starter/search_engine.py",
            levels=(
                ChallengeLevelDefinition(
                    id="single-term-search",
                    title="Level 1",
                    sections=(),
                    design_feedback_path="level-1/design-feedback.md",
                    tests_path="level-1/tests",
                ),
            ),
        )

    def _attempt(self) -> Attempt:
        self.challenge_repository.get_latest_manifest.return_value = self._manifest()
        self.attempt_repository.add.side_effect = lambda attempt: attempt
        return self.service.start_attempt(uuid4(), "search-engine")

    @staticmethod
    def _sections() -> tuple[LevelSection, ...]:
        return (
            LevelSection(
                id="api",
                title="Public API",
                content="## API",
                display=SectionDisplay.EXPANDED,
            ),
        )


if __name__ == "__main__":
    unittest.main()
