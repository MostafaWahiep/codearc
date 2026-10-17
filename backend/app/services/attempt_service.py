from datetime import datetime
from typing import Callable
from uuid import UUID

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge_level import LevelProgressStatus
from app.repositories.attempt_repository import AttemptNotFound, AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository


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
