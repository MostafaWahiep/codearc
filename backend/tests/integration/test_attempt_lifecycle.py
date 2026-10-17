import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from app import create_app
from app.extensions import db


class AttemptLifecycleIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        database_path = Path(self.temporary_directory.name).joinpath("codearc.db")
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_path}",
            }
        )
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.app_context.pop()
        self.temporary_directory.cleanup()

    def test_lists_challenges_starts_attempt_and_retrieves_it(self) -> None:
        challenges_response = self.client.get("/api/v1/challenges")

        self.assertEqual(challenges_response.status_code, 200)
        challenges = challenges_response.get_json()
        self.assertGreater(len(challenges), 0)
        challenge = challenges[0]

        user_id = str(uuid4())
        start_response = self.client.post(
            "/api/v1/attempts",
            json={
                "userId": user_id,
                "challengeId": challenge["id"],
            },
        )

        self.assertEqual(start_response.status_code, 201)
        started_attempt = start_response.get_json()
        self.assertEqual(started_attempt["challengeId"], challenge["id"])
        self.assertEqual(started_attempt["version"], challenge["version"])
        self.assertEqual(started_attempt["status"], "in_progress")
        self.assertIsNotNone(started_attempt["activeLevelId"])

        db.session.remove()

        attempts_response = self.client.get(
            "/api/v1/attempts",
            query_string={
                "userId": user_id,
                "challengeId": challenge["id"],
            },
        )

        self.assertEqual(attempts_response.status_code, 200)
        attempts = attempts_response.get_json()
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["id"], started_attempt["id"])
        self.assertNotIn("levels", attempts[0])

        retrieve_response = self.client.get(
            f"/api/v1/attempts/{started_attempt['id']}"
        )

        self.assertEqual(retrieve_response.status_code, 200)
        self.assertEqual(retrieve_response.get_json(), started_attempt)

        level_response = self.client.get(
            f"/api/v1/attempts/{started_attempt['id']}/level"
        )

        self.assertEqual(level_response.status_code, 200)
        visible_level = level_response.get_json()
        self.assertEqual(visible_level["id"], started_attempt["activeLevelId"])
        self.assertEqual(visible_level["status"], "active")
        self.assertGreater(len(visible_level["sections"]), 0)
        self.assertIsNone(visible_level["designFeedback"])
        self.assertNotIn("levels", visible_level)


if __name__ == "__main__":
    unittest.main()
