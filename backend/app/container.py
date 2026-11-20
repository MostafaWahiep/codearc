from dependency_injector import containers, providers

from app.extensions import db
from app.infrastructure.file_challenge_repository import FileChallengeRepository
from app.infrastructure.local_submission_snapshot_store import (
    LocalSubmissionSnapshotStore,
)
from app.infrastructure.runtime import new_uuid, utc_now
from app.infrastructure.sqlalchemy_attempt_repository import SQLAlchemyAttemptRepository
from app.infrastructure.sqlalchemy_submission_repository import (
    SQLAlchemySubmissionRepository,
)
from app.infrastructure.sqlalchemy_transaction_manager import (
    SQLAlchemyTransactionManager,
)
from app.services.attempt_service import AttemptService
from app.services.challenge_service import ChallengeService
from app.services.submission_service import SubmissionService
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

    transaction_manager = providers.Singleton(
        SQLAlchemyTransactionManager,
        db=database,
    )

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

    submission_repository = providers.Singleton(
        SQLAlchemySubmissionRepository,
        db=database,
    )

    submission_snapshot_store = providers.Singleton(
        LocalSubmissionSnapshotStore,
        root_path=config.CODEARC_SUBMISSION_STORAGE_ROOT,
    )

    challenge_service = providers.Factory(
        ChallengeService,
        challenge_repository=challenge_repository,
    )

    attempt_service = providers.Factory(
        AttemptService,
        attempt_repository=attempt_repository,
        challenge_repository=challenge_repository,
        submission_repository=submission_repository,
        transaction_manager=transaction_manager,
        clock=clock,
        id_factory=id_factory,
    )

    submission_service = providers.Factory(
        SubmissionService,
        attempt_repository=attempt_repository,
        submission_repository=submission_repository,
        snapshot_store=submission_snapshot_store,
        transaction_manager=transaction_manager,
        clock=clock,
        id_factory=id_factory,
    )
