from typing import Protocol
from uuid import UUID

from app.domain.submission import Submission


class SubmissionNotFound(LookupError):
    def __init__(self, submission_id: UUID) -> None:
        super().__init__(f"Submission '{submission_id}' was not found")
        self.submission_id = submission_id


class SubmissionRepository(Protocol):
    def add(self, submission: Submission) -> Submission:
        ...

    def update(self, submission: Submission) -> Submission:
        ...

    def get_by_id(self, submission_id: UUID) -> Submission | None:
        ...

    def list_for_attempt(self, attempt_id: UUID) -> list[Submission]:
        ...
