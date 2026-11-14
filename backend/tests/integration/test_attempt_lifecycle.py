import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID, uuid4

from app import create_app
from app.extensions import db
from app.infrastructure.database.attempt_models import AttemptModel


class AttemptLifecycleIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        temporary_root = Path(self.temporary_directory.name)
        database_path = temporary_root.joinpath("codearc.db")
        self.submission_storage_root = temporary_root.joinpath("submissions")
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_path}",
                "CODEARC_SUBMISSION_STORAGE_ROOT": self.submission_storage_root,
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

    def test_completes_challenge_discovery_and_submission_setup(self) -> None:
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
            f"/api/v1/attempts/{started_attempt['id']}"
            f"/levels/{started_attempt['activeLevelId']}"
        )

        self.assertEqual(level_response.status_code, 200)
        visible_level = level_response.get_json()
        self.assertEqual(visible_level["id"], started_attempt["activeLevelId"])
        self.assertEqual(visible_level["status"], "active")
        self.assertGreater(len(visible_level["sections"]), 0)
        self.assertIsNone(visible_level["designFeedback"])
        self.assertNotIn("levels", visible_level)

        tests_response = self.client.get(
            f"/api/v1/attempts/{started_attempt['id']}/tests"
        )

        self.assertEqual(tests_response.status_code, 200)
        test_bundle = tests_response.get_json()
        self.assertEqual(test_bundle["runner"], "pytest")
        self.assertGreater(len(test_bundle["files"]), 0)
        self.assertTrue(
            all(file["category"] == "current" for file in test_bundle["files"])
        )

        submission_response = self.client.post(
            f"/api/v1/attempts/{started_attempt['id']}/submissions",
            json={
                "files": [
                    {
                        "path": "search_engine.py",
                        "content": "class SearchEngine:\n    pass\n",
                    },
                ],
            },
        )

        self.assertEqual(submission_response.status_code, 201)
        submission = submission_response.get_json()
        self.assertEqual(submission["attemptId"], started_attempt["id"])
        self.assertEqual(submission["levelId"], started_attempt["activeLevelId"])
        self.assertEqual(submission["sequenceNumber"], 1)
        self.assertEqual(submission["status"], "received")
        self.assertTrue(
            self.submission_storage_root.joinpath(
                started_attempt["id"],
                submission["id"],
                "source",
                "search_engine.py",
            ).is_file(),
        )

        stored_attempt = db.session.get(
            AttemptModel,
            UUID(started_attempt["id"]),
        )
        self.assertIsNotNone(stored_attempt)
        self.assertEqual(stored_attempt.submission_count, 1)


if __name__ == "__main__":
    unittest.main()
