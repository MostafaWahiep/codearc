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
class SnapshotContext:
    challenge_id: str
    challenge_version: str


@dataclass(frozen=True)
class SnapshotFileManifest:
    path: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class SnapshotManifest:
    schema_version: int
    submission_id: UUID
    attempt_id: UUID
    challenge_id: str
    challenge_version: str
    level_id: str
    sequence_number: int
    created_at: datetime
    source_hash: str
    file_count: int
    total_bytes: int
    files: tuple[SnapshotFileManifest, ...]


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
