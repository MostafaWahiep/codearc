from dependency_injector import containers, providers

from app.validation.manifest_validator import ManifestValidator
from app.infrastructure.file_challenge_repository import FileChallengeRepository
from app.services.challenge_service import ChallengeService


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[".api.v1.challenge"],
    )

    config = providers.Configuration()

    manifest_validator = providers.Singleton(
        ManifestValidator,
        schema_path=config.CHALLENGE_SCHEMA_PATH,
    )

    challenge_repository = providers.Singleton(
        FileChallengeRepository,
        challenges_root=config.CHALLENGES_ROOT,
        validator=manifest_validator,
    )

    challenge_service = providers.Factory(
        ChallengeService,
        challenge_repository=challenge_repository,
    )
