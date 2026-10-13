from dataclasses import dataclass
from enum import Enum

from app.domain.level_section import LevelSection, LevelSectionDefinition


class LevelStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


@dataclass(frozen=True)
class ChallengeLevelDefinition:
    """Level metadata from the manifest, containing paths rather than content."""

    id: str
    title: str
    sections: tuple[LevelSectionDefinition, ...]
    design_feedback_path: str
    tests_path: str


@dataclass(frozen=True)
class VisibleLevel:
    """Level content that the learner is currently allowed to see."""

    id: str
    title: str
    status: LevelStatus
    sections: tuple[LevelSection, ...]
    design_feedback: str | None


@dataclass(frozen=True)
class LoadedChallengeLevel:
    """Level content loaded from a challenge package before visibility rules."""

    id: str
    title: str
    sections: tuple[LevelSection, ...]
