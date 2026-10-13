from typing import Protocol
from uuid import UUID

from app.domain.attempt import Attempt


class AttemptNotFound(LookupError):
    def __init__(self, attempt_id: UUID) -> None:
        super().__init__(f"Attempt '{attempt_id}' was not found")
        self.attempt_id = attempt_id


class AttemptRepository(Protocol):
    def add(self, attempt: Attempt) -> Attempt:
        ...

    def update(self, attempt: Attempt) -> Attempt:
        ...

    def get_by_id(self, attempt_id: UUID) -> Attempt | None:
        ...

    def find_by_user_and_challenge(
        self,
        user_id: UUID,
        challenge_id: str,
    ) -> list[Attempt]:
        ...
