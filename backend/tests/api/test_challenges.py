import unittest
from unittest.mock import Mock

from app import create_app
from app.domain.challenge import ChallengeSummary
from app.domain.starter_file import StarterFile, StarterFiles
from app.infrastructure.file_challenge_repository import InvalidChallengePackage
from app.repositories.challenge_repository import ChallengeReleaseNotFound
from app.services.challenge_service import ChallengeService


class ChallengeEndpointTests(unittest.TestCase):
    def test_lists_challenges_using_injected_service(self) -> None:
        app = create_app()
        service = Mock(spec=ChallengeService)
        service.list_challenges.return_value = [
            ChallengeSummary(
                id="search-engine",
                version="2",
                title="Build a Search Engine",
                description="Build an evolving search engine.",
                level_count=3,
            )
        ]

        with app.container.challenge_service.override(service):
            response = app.test_client().get("/api/v1/challenges")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "id": "search-engine",
                    "version": "2",
                    "title": "Build a Search Engine",
                    "description": "Build an evolving search engine.",
                    "levelCount": 3,
                }
            ],
        )
        service.list_challenges.assert_called_once_with()

    def test_returns_starter_files_for_exact_challenge_release(self) -> None:
        app = create_app()
        service = Mock(spec=ChallengeService)
        service.load_starter_files.return_value = StarterFiles(
            challenge_id="search-engine",
            version="2",
            entrypoint="search_engine.py",
            files=(
                StarterFile(
                    file_path="helpers/tokenize.py",
                    content="def tokenize(text):\n    return text.split()\n",
                ),
                StarterFile(
                    file_path="search_engine.py",
                    content="class SearchEngine:\n    pass\n",
                ),
            ),
        )

        with app.container.challenge_service.override(service):
            response = app.test_client().get(
                "/api/v1/challenges/search-engine/starter-files",
                query_string={"version": "2"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "challengeId": "search-engine",
                "version": "2",
                "entrypoint": "search_engine.py",
                "files": [
                    {
                        "filePath": "helpers/tokenize.py",
                        "content": "def tokenize(text):\n    return text.split()\n",
                    },
                    {
                        "filePath": "search_engine.py",
                        "content": "class SearchEngine:\n    pass\n",
                    },
                ],
            },
        )
        service.load_starter_files.assert_called_once_with("search-engine", "2")

    def test_rejects_missing_starter_files_version(self) -> None:
        app = create_app()
        service = Mock(spec=ChallengeService)

        with app.container.challenge_service.override(service):
            response = app.test_client().get(
                "/api/v1/challenges/search-engine/starter-files"
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"message": "version is a required query parameter"},
        )
        service.load_starter_files.assert_not_called()

    def test_returns_not_found_for_unknown_challenge_release(self) -> None:
        app = create_app()
        service = Mock(spec=ChallengeService)
        service.load_starter_files.side_effect = ChallengeReleaseNotFound(
            "Challenge release 'search-engine' version '99' was not found"
        )

        with app.container.challenge_service.override(service):
            response = app.test_client().get(
                "/api/v1/challenges/search-engine/starter-files",
                query_string={"version": "99"},
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json(),
            {
                "message": (
                    "Challenge release 'search-engine' version '99' was not found"
                )
            },
        )

    def test_hides_invalid_challenge_package_details(self) -> None:
        app = create_app()
        service = Mock(spec=ChallengeService)
        service.load_starter_files.side_effect = InvalidChallengePackage(
            "Secret server path"
        )

        with app.container.challenge_service.override(service):
            response = app.test_client().get(
                "/api/v1/challenges/search-engine/starter-files",
                query_string={"version": "1"},
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.get_json(),
            {"message": "Challenge starter files are unavailable"},
        )


if __name__ == "__main__":
    unittest.main()
