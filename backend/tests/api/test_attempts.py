import unittest
from datetime import datetime, timezone
from unittest.mock import Mock
from uuid import UUID

from app import create_app
from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge_level import LevelProgressStatus, VisibleLevel
from app.domain.level_section import LevelSection, SectionDisplay
from app.repositories.attempt_repository import AttemptNotFound
from app.repositories.challenge_repository import ChallengeNotFound
from app.services.attempt_service import AttemptHasNoActiveLevel, AttemptService


USER_ID = UUID("11111111-1111-4111-8111-111111111111")
ATTEMPT_ID = UUID("22222222-2222-4222-8222-222222222222")
STARTED_AT = datetime(2026, 10, 13, 12, 30, tzinfo=timezone.utc)


def make_attempt() -> Attempt:
    return Attempt(
        id=ATTEMPT_ID,
        user_id=USER_ID,
        challenge_id="search-engine",
        challenge_version="1",
        status=AttemptStatus.IN_PROGRESS,
        started_at=STARTED_AT,
        updated_at=STARTED_AT,
        completed_at=None,
        active_level_id="single-term-search",
        levels=(
            LevelProgress(
                level_id="single-term-search",
                status=LevelProgressStatus.ACTIVE,
                submission_count=0,
                completed_at=None,
            ),
        ),
    )


class AttemptEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.client = self.app.test_client()
        self.service = Mock(spec=AttemptService)

    def test_starts_attempt_using_injected_service(self) -> None:
        self.service.start_attempt.return_value = make_attempt()

        with self.app.container.attempt_service.override(self.service):
            response = self.client.post(
                "/api/v1/attempts",
                json={
                    "userId": str(USER_ID),
                    "challengeId": "search-engine",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.get_json(),
            {
                "id": str(ATTEMPT_ID),
                "userId": str(USER_ID),
                "challengeId": "search-engine",
                "version": "1",
                "status": "in_progress",
                "startedAt": "2026-10-13T12:30:00+00:00",
                "updatedAt": "2026-10-13T12:30:00+00:00",
                "completedAt": None,
                "activeLevelId": "single-term-search",
                "levels": [
                    {
                        "levelId": "single-term-search",
                        "status": "active",
                        "submissionCount": 0,
                        "completedAt": None,
                    }
                ],
            },
        )
        self.service.start_attempt.assert_called_once_with(
            user_id=USER_ID,
            challenge_id="search-engine",
        )

    def test_lists_user_attempts_for_challenge(self) -> None:
        self.service.list_attempts.return_value = [make_attempt()]

        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(
                "/api/v1/attempts",
                query_string={
                    "userId": str(USER_ID),
                    "challengeId": "search-engine",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "id": str(ATTEMPT_ID),
                    "version": "1",
                    "status": "in_progress",
                    "activeLevelId": "single-term-search",
                    "startedAt": "2026-10-13T12:30:00+00:00",
                    "updatedAt": "2026-10-13T12:30:00+00:00",
                    "completedAt": None,
                }
            ],
        )
        self.service.list_attempts.assert_called_once_with(
            user_id=USER_ID,
            challenge_id="search-engine",
        )

    def test_rejects_missing_attempt_list_query_parameters(self) -> None:
        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(
                "/api/v1/attempts",
                query_string={"userId": str(USER_ID)},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {
                "message": (
                    "userId and challengeId are required query parameters"
                )
            },
        )
        self.service.list_attempts.assert_not_called()

    def test_rejects_invalid_attempt_list_user_id(self) -> None:
        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(
                "/api/v1/attempts",
                query_string={
                    "userId": "not-a-uuid",
                    "challengeId": "search-engine",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"message": "userId must be a valid UUID"},
        )
        self.service.list_attempts.assert_not_called()

    def test_rejects_missing_or_non_object_json_body(self) -> None:
        requests = (
            {},
            {"json": []},
            {"data": "not-json", "content_type": "application/json"},
        )

        with self.app.container.attempt_service.override(self.service):
            for request_arguments in requests:
                with self.subTest(request_arguments=request_arguments):
                    response = self.client.post(
                        "/api/v1/attempts",
                        **request_arguments,
                    )

                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(
                        response.get_json(),
                        {"message": "Request body must be a JSON object"},
                    )

        self.service.start_attempt.assert_not_called()

    def test_rejects_missing_attempt_fields(self) -> None:
        bodies = (
            {},
            {"userId": str(USER_ID)},
            {"challengeId": "search-engine"},
            {"userId": "", "challengeId": "search-engine"},
        )

        with self.app.container.attempt_service.override(self.service):
            for body in bodies:
                with self.subTest(body=body):
                    response = self.client.post("/api/v1/attempts", json=body)

                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(
                        response.get_json(),
                        {
                            "message": (
                                "userId and challengeId are required strings"
                            )
                        },
                    )

        self.service.start_attempt.assert_not_called()

    def test_rejects_invalid_user_id(self) -> None:
        with self.app.container.attempt_service.override(self.service):
            response = self.client.post(
                "/api/v1/attempts",
                json={
                    "userId": "not-a-uuid",
                    "challengeId": "search-engine",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"message": "userId must be a valid UUID"},
        )
        self.service.start_attempt.assert_not_called()

    def test_returns_not_found_for_unknown_challenge(self) -> None:
        self.service.start_attempt.side_effect = ChallengeNotFound("unknown")

        with self.app.container.attempt_service.override(self.service):
            response = self.client.post(
                "/api/v1/attempts",
                json={
                    "userId": str(USER_ID),
                    "challengeId": "unknown",
                },
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json(),
            {"message": "Challenge 'unknown' was not found"},
        )

    def test_gets_attempt_using_injected_service(self) -> None:
        self.service.get_attempt.return_value = make_attempt()

        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(f"/api/v1/attempts/{ATTEMPT_ID}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["id"], str(ATTEMPT_ID))
        self.assertEqual(response.get_json()["activeLevelId"], "single-term-search")
        self.service.get_attempt.assert_called_once_with(attempt_id=ATTEMPT_ID)

    def test_returns_not_found_for_unknown_attempt(self) -> None:
        self.service.get_attempt.side_effect = AttemptNotFound(ATTEMPT_ID)

        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(f"/api/v1/attempts/{ATTEMPT_ID}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json(),
            {"message": f"Attempt '{ATTEMPT_ID}' was not found"},
        )

    def test_rejects_malformed_attempt_id_at_routing_boundary(self) -> None:
        with self.app.container.attempt_service.override(self.service):
            response = self.client.get("/api/v1/attempts/not-a-uuid")

        self.assertEqual(response.status_code, 404)
        self.service.get_attempt.assert_not_called()

    def test_returns_the_active_level_with_ordered_sections(self) -> None:
        self.service.get_active_level.return_value = VisibleLevel(
            id="single-term-search",
            title="Level 1: Single-Term Search",
            status=LevelProgressStatus.ACTIVE,
            sections=(
                LevelSection(
                    id="api",
                    title="Public API",
                    content="## SearchEngine",
                    display=SectionDisplay.EXPANDED,
                ),
                LevelSection(
                    id="requirements",
                    title="What must work",
                    content="Search exact terms.",
                    display=SectionDisplay.COLLAPSED,
                ),
            ),
            design_feedback=None,
        )

        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(
                f"/api/v1/attempts/{ATTEMPT_ID}/level"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "id": "single-term-search",
                "title": "Level 1: Single-Term Search",
                "status": "active",
                "sections": [
                    {
                        "id": "api",
                        "title": "Public API",
                        "content": "## SearchEngine",
                        "display": "expanded",
                    },
                    {
                        "id": "requirements",
                        "title": "What must work",
                        "content": "Search exact terms.",
                        "display": "collapsed",
                    },
                ],
                "designFeedback": None,
            },
        )
        self.service.get_active_level.assert_called_once_with(
            attempt_id=ATTEMPT_ID,
        )

    def test_returns_conflict_when_attempt_has_no_active_level(self) -> None:
        self.service.get_active_level.side_effect = AttemptHasNoActiveLevel(
            ATTEMPT_ID
        )

        with self.app.container.attempt_service.override(self.service):
            response = self.client.get(
                f"/api/v1/attempts/{ATTEMPT_ID}/level"
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.get_json(),
            {"message": f"Attempt '{ATTEMPT_ID}' has no active level"},
        )


if __name__ == "__main__":
    unittest.main()
