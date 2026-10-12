from typing import Protocol

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import LoadedChallengeLevel


class ChallengeRepository(Protocol):
    def list_manifests(self) -> tuple[ChallengeManifest, ...]:
        ...

    def get_manifest(
        self,
        challenge_id: str,
        version: str,
    ) -> ChallengeManifest:
        ...

    def load_level(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> LoadedChallengeLevel:
        ...

    def load_design_feedback(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> str:
        ...
