from dataclasses import dataclass
from enum import Enum

from app.domain.attempt import Attempt


@dataclass(frozen=True)
class TestSubmission:
    level_id: str
    exit_code: int
    timed_out: bool
    passed_count: int
    failed_count: int


class TestSubmissionOutcome(str, Enum):
    TESTS_FAILED = "tests_failed"
    LEVEL_COMPLETED = "level_completed"
    ATTEMPT_COMPLETED = "attempt_completed"


@dataclass(frozen=True)
class TestSubmissionResult:
    outcome: TestSubmissionOutcome
    attempt: Attempt
    completed_level_id: str | None
