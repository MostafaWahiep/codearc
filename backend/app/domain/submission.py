from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID


class SubmissionStatus(str, Enum):
    RECEIVED = "received"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"


@dataclass(frozen=True)
class SourceFile:
    path: str
    content: str


@dataclass(frozen=True)
class SourceSnapshot:
    files: tuple[SourceFile, ...]


@dataclass(frozen=True)
class Submission:
    id: UUID
    attempt_id: UUID
    level_id: str
    sequence_number: int
    status: SubmissionStatus
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
