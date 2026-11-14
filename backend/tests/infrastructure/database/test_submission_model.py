import unittest
from uuid import uuid4

from flask import Flask
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.infrastructure.database.attempt_models import AttemptModel
from app.infrastructure.database.submission_model import SubmissionModel


class SubmissionModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.init_app(self.app)
        db.create_all()

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.app_context.pop()

    def test_creates_expected_submission_schema(self) -> None:
        inspector = inspect(db.engine)
        columns = {
            column["name"]: column
            for column in inspector.get_columns("submissions")
        }

        self.assertEqual(
            set(columns),
            {
                "id",
                "attempt_id",
                "level_id",
                "sequence_number",
                "status",
                "created_at",
                "started_at",
                "completed_at",
            },
        )
        self.assertFalse(columns["attempt_id"]["nullable"])
        self.assertFalse(columns["sequence_number"]["nullable"])
        self.assertTrue(columns["started_at"]["nullable"])
        self.assertTrue(columns["completed_at"]["nullable"])

        unique_constraints = {
            constraint["name"]: constraint["column_names"]
            for constraint in inspector.get_unique_constraints("submissions")
        }
        self.assertEqual(
            unique_constraints["uq_submissions_attempt_sequence"],
            ["attempt_id", "sequence_number"],
        )

        check_constraints = {
            constraint["name"]: constraint["sqltext"]
            for constraint in inspector.get_check_constraints("submissions")
        }
        self.assertEqual(
            check_constraints["ck_submissions_sequence_number_positive"],
            "sequence_number > 0",
        )
        self.assertEqual(
            check_constraints["submission_status"],
            "status IN ('received', 'running', 'passed', 'failed', 'error')",
        )

    def test_rejects_duplicate_sequence_number_for_attempt(self) -> None:
        attempt = self._attempt()
        attempt_id = attempt.id
        db.session.add(attempt)
        db.session.add_all(
            [
                SubmissionModel(
                    attempt_id=attempt_id,
                    level_id="single-term-search",
                    sequence_number=1,
                ),
                SubmissionModel(
                    attempt_id=attempt_id,
                    level_id="single-term-search",
                    sequence_number=1,
                ),
            ],
        )

        with self.assertRaises(IntegrityError):
            db.session.commit()

    def test_rejects_nonpositive_sequence_number(self) -> None:
        attempt = self._attempt()
        attempt_id = attempt.id
        db.session.add(attempt)
        db.session.add(
            SubmissionModel(
                attempt_id=attempt_id,
                level_id="single-term-search",
                sequence_number=0,
            ),
        )

        with self.assertRaises(IntegrityError):
            db.session.commit()

    @staticmethod
    def _attempt() -> AttemptModel:
        return AttemptModel(
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            active_level_id="single-term-search",
        )


if __name__ == "__main__":
    unittest.main()
