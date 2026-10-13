from app.domain.challenge import ChallengeSummary
from app.domain.challenge_level import LevelStatus, VisibleLevel
from app.repositories.challenge_repository import ChallengeRepository


class ChallengeService:
    def __init__(
        self,
        challenge_repository: ChallengeRepository,
    ):
        self._challenge_repository = challenge_repository

    def list_challenges(self) -> list[ChallengeSummary]:
        manifests = self._challenge_repository.list_manifests()
        latest_by_challenge_id = {}

        for manifest in manifests:
            current = latest_by_challenge_id.get(manifest.id)
            if current is None or int(manifest.version) > int(current.version):
                latest_by_challenge_id[manifest.id] = manifest

        return [
            ChallengeSummary(
                id=manifest.id,
                version=manifest.version,
                title=manifest.title,
                description=manifest.description,
                level_count=len(manifest.levels),
            )
            for manifest in sorted(
                latest_by_challenge_id.values(),
                key=lambda item: item.id,
            )
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
            status=LevelStatus.ACTIVE,
            sections=level.sections,
            design_feedback=None,
        )
