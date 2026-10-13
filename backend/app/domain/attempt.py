from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID

from app.domain.challenge_level import LevelProgressStatus


class AttemptStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


@dataclass(frozen=True)
class LevelProgress:
    level_id: str
    status: LevelProgressStatus
    submission_count: int
    completed_at: datetime | None


@dataclass(frozen=True)
class Attempt:
    id: UUID
    user_id: UUID
    challenge_id: str
    challenge_version: str
    status: AttemptStatus
    started_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    active_level_id: str | None
    levels: tuple[LevelProgress, ...]
