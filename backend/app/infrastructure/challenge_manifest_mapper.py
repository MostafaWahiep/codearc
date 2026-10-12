from typing import Any, Mapping

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import ChallengeLevelDefinition
from app.domain.level_section import LevelSectionDefinition, SectionDisplay


def map_challenge_manifest(
    manifest: Mapping[str, Any],
) -> ChallengeManifest:
    return ChallengeManifest(
        id=manifest["id"],
        title=manifest["title"],
        description=manifest["description"],
        version=manifest["version"],
        starter_path=manifest["starterPath"],
        entrypoint_path=manifest["entrypointPath"],
        levels=tuple(_map_level(level) for level in manifest["levels"]),
    )


def _map_level(
    level: Mapping[str, Any],
) -> ChallengeLevelDefinition:
    return ChallengeLevelDefinition(
        id=level["id"],
        title=level["title"],
        sections=tuple(_map_section(section) for section in level["sections"]),
        design_feedback_path=level["designFeedbackPath"],
        tests_path=level["testsPath"],
    )


def _map_section(
    section: Mapping[str, Any],
) -> LevelSectionDefinition:
    return LevelSectionDefinition(
        id=section["id"],
        title=section["title"],
        content_path=section["contentPath"],
        display=SectionDisplay(section["display"]),
    )
