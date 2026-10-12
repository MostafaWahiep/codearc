import unittest

from app import create_app
from app.infrastructure.file_challenge_repository import FileChallengeRepository
from app.services.challenge_service import ChallengeService
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


if __name__ == "__main__":
    unittest.main()
