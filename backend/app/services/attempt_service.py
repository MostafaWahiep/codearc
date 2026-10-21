from dataclasses import replace
from datetime import datetime
from typing import Callable
from uuid import UUID

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import LevelProgressStatus, VisibleLevel
from app.domain.test_bundle import PublicTestFile, TestCategory
from app.domain.test_submission import (
    TestSubmission,
    TestSubmissionOutcome,
    TestSubmissionResult,
)
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository


class AttemptLevelNotVisible(LookupError):
    def __init__(self, attempt_id: UUID, level_id: str) -> None:
        super().__init__(
            f"Level '{level_id}' is not visible in attempt '{attempt_id}'"
        )
        self.attempt_id = attempt_id
        self.level_id = level_id


class AttemptLevelNotActive(LookupError):
    def __init__(self, attempt_id: UUID, level_id: str, active_level_id: str) -> None:
        super().__init__(
            f"Level '{level_id}' is not the active level in attempt "
            f"'{attempt_id}'. The active level is '{active_level_id}'"
        )
        self.attempt_id = attempt_id
        self.level_id = level_id
        self.active_level_id = active_level_id


class InvalidAttemptState(RuntimeError):
    pass


class AttemptService:
    def __init__(
        self,
        attempt_repository: AttemptRepository,
        challenge_repository: ChallengeRepository,
        clock: Callable[[], datetime],
        id_factory: Callable[[], UUID],
    ) -> None:
        self._attempt_repository = attempt_repository
        self._challenge_repository = challenge_repository
        self._clock = clock
        self._id_factory = id_factory

    def start_attempt(
        self,
        user_id: UUID,
        challenge_id: str,
    ) -> Attempt:
        challenge = self._challenge_repository.get_latest_manifest(challenge_id)
        first_level = challenge.levels[0]
        level_progress = self._create_new_level_progress(first_level.id)
        now = self._clock()

        attempt = Attempt(
            id=self._id_factory(),
            user_id=user_id,
            challenge_id=challenge.id,
            challenge_version=challenge.version,
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
            completed_at=None,
            active_level_id=first_level.id,
            levels=(level_progress,),
        )

        return self._attempt_repository.add(attempt)

    def get_attempt(
        self,
        attempt_id: UUID,
    ) -> Attempt:
        attempt = self._attempt_repository.get_by_id(attempt_id)

        if attempt is None:
            raise AttemptNotFound(attempt_id)

        return attempt

    def list_attempts(
        self,
        user_id: UUID,
        challenge_id: str,
    ) -> list[Attempt]:
        return self._attempt_repository.find_by_user_and_challenge(
            user_id,
            challenge_id,
        )

    def get_visible_level(
        self,
        attempt_id: UUID,
        level_id: str,
    ) -> VisibleLevel:
        attempt = self.get_attempt(attempt_id)

        return self._build_visible_level(attempt, level_id)

    def get_visible_tests(
        self,
        attempt_id: UUID,
    ) -> tuple[PublicTestFile, ...]:
        attempt = self.get_attempt(attempt_id)
        files: list[PublicTestFile] = []

        for progress in attempt.levels:
            category = (
                TestCategory.CURRENT
                if progress.level_id == attempt.active_level_id
                else TestCategory.REGRESSION
            )
            level_files = self._challenge_repository.load_public_tests(
                attempt.challenge_id,
                attempt.challenge_version,
                progress.level_id,
            )
            files.extend(
                PublicTestFile(
                    level_id=file.level_id,
                    path=file.path,
                    content=file.content,
                    category=category,
                )
                for file in level_files
            )

        return tuple(files)

    def submit_test_results(
        self,
        attempt_id: UUID,
        submission: TestSubmission,
    ) -> TestSubmissionResult:
        attempt = self.get_attempt(attempt_id)

        if submission.level_id != attempt.active_level_id:
            raise AttemptLevelNotActive(
                attempt_id,
                submission.level_id,
                attempt.active_level_id,
            )

        level_progress = self._find_level_progress(attempt, submission.level_id)

        challenge = self._challenge_repository.get_manifest(
            attempt.challenge_id,
            attempt.challenge_version,
        )

        now = self._clock()

        attempt = replace(attempt, updated_at=now)
        level_progress = replace(
            level_progress,
            submission_count=level_progress.submission_count + 1,
        )
        attempt = self._replace_level_progress(attempt, level_progress)

        if (
            submission.exit_code != 0
            or submission.timed_out
            or submission.failed_count > 0
        ):
            return self._fail_test_run(
                attempt,
            )

        level_progress = replace(
            level_progress,
            status=LevelProgressStatus.COMPLETED,
            completed_at=level_progress.completed_at or now,
        )
        attempt = self._replace_level_progress(attempt, level_progress)

        if submission.level_id == challenge.levels[-1].id:
            return self._complete_attempt(
                attempt,
                level_progress,
                now,
            )

        next_level_id = self._get_next_level_id(challenge, submission.level_id)

        next_level_progress = self._create_new_level_progress(next_level_id)
        attempt = replace(attempt, levels=(*attempt.levels, next_level_progress))

        attempt = replace(attempt, active_level_id=next_level_id)

        updated_attempt = self._attempt_repository.update(attempt)

        return TestSubmissionResult(
            outcome=TestSubmissionOutcome.LEVEL_COMPLETED,
            attempt=updated_attempt,
            completed_level_id=submission.level_id,
        )

    def _build_visible_level(
        self,
        attempt: Attempt,
        level_id: str,
    ) -> VisibleLevel:

        level_progress = next(
            (
                level
                for level in attempt.levels
                if (
                    level.level_id == level_id
                    and level.status
                    in (
                        LevelProgressStatus.COMPLETED,
                        LevelProgressStatus.ACTIVE,
                    )
                )
            ),
            None,
        )

        if level_progress is None:
            raise AttemptLevelNotVisible(attempt.id, level_id)

        level = self._challenge_repository.load_level(
            attempt.challenge_id,
            attempt.challenge_version,
            level_id,
        )

        design_feedback = None

        if level_progress.status == LevelProgressStatus.COMPLETED:
            design_feedback = self._challenge_repository.load_design_feedback(
                attempt.challenge_id,
                attempt.challenge_version,
                level_id,
            )

        return VisibleLevel(
            id=level_id,
            title=level.title,
            status=level_progress.status,
            sections=level.sections,
            design_feedback=design_feedback,
        )

    def _create_new_level_progress(
        self,
        level_id: str,
    ) -> LevelProgress:
        return LevelProgress(
            level_id=level_id,
            status=LevelProgressStatus.ACTIVE,
            submission_count=0,
            completed_at=None,
        )

    def _fail_test_run(
        self,
        attempt: Attempt,
    ) -> TestSubmissionResult:
        updated_attempt = self._attempt_repository.update(attempt)

        return TestSubmissionResult(
            outcome=TestSubmissionOutcome.TESTS_FAILED,
            attempt=updated_attempt,
            completed_level_id=None,
        )

    def _complete_attempt(
        self,
        attempt: Attempt,
        level_progress: LevelProgress,
        completed_at: datetime,
    ) -> TestSubmissionResult:
        attempt = replace(
            attempt,
            status=AttemptStatus.COMPLETED,
            completed_at=completed_at,
        )

        updated_attempt = self._attempt_repository.update(attempt)

        return TestSubmissionResult(
            outcome=TestSubmissionOutcome.ATTEMPT_COMPLETED,
            attempt=updated_attempt,
            completed_level_id=level_progress.level_id,
        )

    def _find_level_progress(
        self,
        attempt: Attempt,
        level_id: str,
    ) -> LevelProgress:
        progress = next(
            (
                progress
                for progress in attempt.levels
                if progress.level_id == level_id
            ),
            None,
        )

        if progress is None:
            raise InvalidAttemptState(
                f"Attempt '{attempt.id}' has no progress for '{level_id}'"
            )

        return progress

    def _get_next_level_id(
        self,
        challenge: ChallengeManifest,
        current_level_id: str,
    ) -> str:
        level_ids = [level.id for level in challenge.levels]
        current_index = level_ids.index(current_level_id)

        if current_index == len(level_ids) - 1:
            raise InvalidAttemptState(
                f"Level '{current_level_id}' has no next level"
            )

        return level_ids[current_index + 1]

    def _replace_level_progress(
        self,
        attempt: Attempt,
        updated_progress: LevelProgress,
    ) -> Attempt:
        levels = tuple(
            updated_progress
            if progress.level_id == updated_progress.level_id
            else progress
            for progress in attempt.levels
        )
        return replace(attempt, levels=levels)
