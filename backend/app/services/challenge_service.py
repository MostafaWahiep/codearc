from app.domain.challenge import ChallengeSummary
from app.domain.challenge_level import LevelProgressStatus, VisibleLevel
from app.repositories.challenge_repository import ChallengeRepository


class ChallengeService:
    def __init__(
        self,
        challenge_repository: ChallengeRepository,
    ):
        self._challenge_repository = challenge_repository

    def list_challenges(self) -> list[ChallengeSummary]:
        manifests = self._challenge_repository.list_manifests()
        challenge_ids = sorted({manifest.id for manifest in manifests})
        latest_manifests = (
            self._challenge_repository.get_latest_manifest(challenge_id)
            for challenge_id in challenge_ids
        )

        return [
            ChallengeSummary(
                id=manifest.id,
                version=manifest.version,
                title=manifest.title,
                description=manifest.description,
                level_count=len(manifest.levels),
            )
            for manifest in latest_manifests
        ]

    def load_first_level(
        self,
        challenge_id: str,
        version: str,
    ) -> VisibleLevel:
        manifest = self._challenge_repository.get_manifest(
            challenge_id,
            version,
        )

        first_level = manifest.levels[0]

        level = self._challenge_repository.load_level(
            challenge_id,
            version,
            first_level.id,
        )

        return VisibleLevel(
            id=level.id,
            title=level.title,
            status=LevelProgressStatus.ACTIVE,
            sections=level.sections,
            design_feedback=None,
        )
