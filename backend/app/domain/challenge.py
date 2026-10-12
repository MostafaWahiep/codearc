from dataclasses import dataclass

from app.domain.challenge_level import ChallengeLevelDefinition


@dataclass(frozen=True)
class ChallengeManifest:
    """A validated challenge manifest without loaded level content."""

    id: str
    title: str
    description: str
    version: str
    starter_path: str
    entrypoint_path: str
    levels: tuple[ChallengeLevelDefinition, ...]


@dataclass(frozen=True)
class ChallengeSummary:
    """Challenge metadata returned when learners browse the catalog."""

    id: str
    version: str
    title: str
    description: str
    level_count: int
