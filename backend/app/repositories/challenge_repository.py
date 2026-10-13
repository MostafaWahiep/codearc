from typing import Protocol

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import LoadedChallengeLevel

class ChallengeNotFound(LookupError):
    def __init__(self, challenge_id: str) -> None:
        super().__init__(f"Challenge '{challenge_id}' was not found")
        self.challenge_id = challenge_id


class ChallengeRepository(Protocol):
    def list_manifests(self) -> tuple[ChallengeManifest, ...]:
        ...

    def get_manifest(
        self,
        challenge_id: str,
        version: str,
    ) -> ChallengeManifest:
        ...

    def get_latest_manifest(
        self,
        challenge_id: str,
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
