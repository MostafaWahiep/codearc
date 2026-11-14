import unittest
from datetime import timezone
from uuid import UUID

from app import create_app
from app.infrastructure.file_challenge_repository import FileChallengeRepository
from app.infrastructure.local_submission_snapshot_store import (
    LocalSubmissionSnapshotStore,
)
from app.infrastructure.runtime import new_uuid, utc_now
from app.infrastructure.sqlalchemy_attempt_repository import (
    SQLAlchemyAttemptRepository,
)
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


class ContainerTests(unittest.TestCase):
    def test_resolves_manifest_validator_as_singleton(self) -> None:
        app = create_app()

        first = app.container.manifest_validator()
        second = app.container.manifest_validator()

        self.assertIsInstance(first, ManifestValidator)
        self.assertIs(first, second)

    def test_resolves_file_challenge_repository_as_singleton(self) -> None:
        app = create_app()

        first = app.container.challenge_repository()
        second = app.container.challenge_repository()

        self.assertIsInstance(first, FileChallengeRepository)
        self.assertIs(first, second)

    def test_resolves_challenge_service_as_factory(self) -> None:
        app = create_app()

        first = app.container.challenge_service()
        second = app.container.challenge_service()

        self.assertIsInstance(first, ChallengeService)
        self.assertIsNot(first, second)

    def test_resolves_attempt_repository_as_singleton(self) -> None:
        app = create_app()

        first = app.container.attempt_repository()
        second = app.container.attempt_repository()

        self.assertIsInstance(first, SQLAlchemyAttemptRepository)
        self.assertIs(first, second)

    def test_resolves_submission_repository_as_singleton(self) -> None:
        app = create_app()

        first = app.container.submission_repository()
        second = app.container.submission_repository()

        self.assertIsInstance(first, SQLAlchemySubmissionRepository)
        self.assertIs(first, second)

    def test_resolves_submission_snapshot_store_as_singleton(self) -> None:
        app = create_app()

        first = app.container.submission_snapshot_store()
        second = app.container.submission_snapshot_store()

        self.assertIsInstance(first, LocalSubmissionSnapshotStore)
        self.assertIs(first, second)

    def test_resolves_transaction_manager_as_singleton(self) -> None:
        app = create_app()

        first = app.container.transaction_manager()
        second = app.container.transaction_manager()

        self.assertIsInstance(first, SQLAlchemyTransactionManager)
        self.assertIs(first, second)

    def test_resolves_attempt_service_with_runtime_dependencies(self) -> None:
        app = create_app()

        first = app.container.attempt_service()
        second = app.container.attempt_service()

        self.assertIsInstance(first, AttemptService)
        self.assertIsNot(first, second)
        self.assertIs(first._attempt_repository, app.container.attempt_repository())
        self.assertIs(first._challenge_repository, app.container.challenge_repository())
        self.assertIs(
            first._transaction_manager,
            app.container.transaction_manager(),
        )
        self.assertIs(first._clock, utc_now)
        self.assertIs(first._id_factory, new_uuid)
        self.assertIs(first._clock().tzinfo, timezone.utc)
        self.assertIsInstance(first._id_factory(), UUID)

    def test_resolves_submission_service_with_dependencies(self) -> None:
        app = create_app()

        first = app.container.submission_service()
        second = app.container.submission_service()

        self.assertIsInstance(first, SubmissionService)
        self.assertIsNot(first, second)
        self.assertIs(first._attempt_repository, app.container.attempt_repository())
        self.assertIs(
            first._submission_repository,
            app.container.submission_repository(),
        )
        self.assertIs(
            first._snapshot_store,
            app.container.submission_snapshot_store(),
        )
        self.assertIs(
            first._transaction_manager,
            app.container.transaction_manager(),
        )


if __name__ == "__main__":
    unittest.main()
