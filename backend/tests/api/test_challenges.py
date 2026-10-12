import unittest
from unittest.mock import Mock

from app import create_app
from app.domain.challenge import ChallengeSummary
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


if __name__ == "__main__":
    unittest.main()
