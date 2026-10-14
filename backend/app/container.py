from dependency_injector import containers, providers

from app.extensions import db
from app.infrastructure.file_challenge_repository import FileChallengeRepository
from app.infrastructure.runtime import new_uuid, utc_now
from app.infrastructure.sqlalchemy_attempt_repository import SQLAlchemyAttemptRepository
from app.services.attempt_service import AttemptService
from app.services.challenge_service import ChallengeService
from app.validation.manifest_validator import ManifestValidator


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            ".api.v1.challenge",
            ".api.v1.attempt",
        ],
    )

    config = providers.Configuration()

    database = providers.Object(db)
    clock = providers.Object(utc_now)
    id_factory = providers.Object(new_uuid)

    manifest_validator = providers.Singleton(
        ManifestValidator,
        schema_path=config.CHALLENGE_SCHEMA_PATH,
    )

    challenge_repository = providers.Singleton(
        FileChallengeRepository,
        challenges_root=config.CHALLENGES_ROOT,
        validator=manifest_validator,
    )

    attempt_repository = providers.Singleton(
        SQLAlchemyAttemptRepository,
        db=database,
    )

    challenge_service = providers.Factory(
        ChallengeService,
        challenge_repository=challenge_repository,
    )

    attempt_service = providers.Factory(
        AttemptService,
        attempt_repository=attempt_repository,
        challenge_repository=challenge_repository,
        clock=clock,
        id_factory=id_factory,
    )
