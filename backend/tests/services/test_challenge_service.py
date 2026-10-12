import unittest
from unittest.mock import Mock

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import ChallengeLevelDefinition
from app.repositories.challenge_repository import ChallengeRepository
from app.services.challenge_service import ChallengeService


class ChallengeServiceTests(unittest.TestCase):
    def test_lists_latest_release_per_challenge_in_id_order(self) -> None:
        repository = Mock(spec=ChallengeRepository)
        repository.list_manifests.return_value = (
            self._manifest("search-engine", "2", level_count=2),
            self._manifest("message-queue", "1", level_count=1),
            self._manifest("search-engine", "10", level_count=3),
            self._manifest("search-engine", "9", level_count=1),
        )
        service = ChallengeService(repository)

        summaries = service.list_challenges()

        self.assertEqual(
            [(summary.id, summary.version) for summary in summaries],
            [("message-queue", "1"), ("search-engine", "10")],
        )
        self.assertEqual(summaries[1].level_count, 3)
        repository.list_manifests.assert_called_once_with()

    def test_returns_empty_list_when_catalog_is_empty(self) -> None:
        repository = Mock(spec=ChallengeRepository)
        repository.list_manifests.return_value = ()
        service = ChallengeService(repository)

        self.assertEqual(service.list_challenges(), [])
        repository.list_manifests.assert_called_once_with()

    @staticmethod
    def _manifest(
        challenge_id: str,
        version: str,
        *,
        level_count: int,
    ) -> ChallengeManifest:
        levels = tuple(
            ChallengeLevelDefinition(
                id=f"level-{index}",
                title=f"Level {index}",
                sections=(),
                design_feedback_path=f"level-{index}/design-feedback.md",
                tests_path=f"level-{index}/tests",
            )
            for index in range(1, level_count + 1)
        )
        return ChallengeManifest(
            id=challenge_id,
            version=version,
            title=f"Challenge {challenge_id}",
            description="Description",
            starter_path="starter",
            entrypoint_path="starter/main.py",
            levels=levels,
        )


if __name__ == "__main__":
    unittest.main()
