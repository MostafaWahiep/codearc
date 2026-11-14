import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from flask import Flask

from app.domain.submission import Submission, SubmissionStatus
from app.extensions import db
from app.infrastructure.database.attempt_models import AttemptModel
from app.infrastructure.sqlalchemy_submission_repository import (
    SQLAlchemySubmissionRepository,
)
from app.repositories.submission_repository import SubmissionNotFound


class SQLAlchemySubmissionRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.init_app(self.app)
        db.create_all()
        self.repository = SQLAlchemySubmissionRepository(db)

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.app_context.pop()

    def test_adds_and_retrieves_submission(self) -> None:
        attempt_id = self._add_attempt()
        submission = self._submission(attempt_id=attempt_id)

        added = self.repository.add(submission)
        retrieved = self.repository.get_by_id(submission.id)

        self.assertEqual(added, submission)
        self.assertEqual(retrieved, submission)

    def test_get_by_id_returns_none_for_unknown_submission(self) -> None:
        self.assertIsNone(self.repository.get_by_id(uuid4()))

    def test_lists_attempt_submissions_in_sequence_order(self) -> None:
        attempt_id = self._add_attempt()
        other_attempt_id = self._add_attempt()
        second = self._submission(attempt_id=attempt_id, sequence_number=2)
        first = self._submission(attempt_id=attempt_id, sequence_number=1)
        other = self._submission(attempt_id=other_attempt_id, sequence_number=1)
        self.repository.add(second)
        self.repository.add(first)
        self.repository.add(other)

        submissions = self.repository.list_for_attempt(attempt_id)

        self.assertEqual(
            [submission.id for submission in submissions],
            [first.id, second.id],
        )

    def test_updates_execution_state_without_changing_identity(self) -> None:
        attempt_id = self._add_attempt()
        original = self._submission(attempt_id=attempt_id)
        self.repository.add(original)
        started_at = original.created_at + timedelta(seconds=1)
        completed_at = started_at + timedelta(seconds=2)
        updated = replace(
            original,
            status=SubmissionStatus.PASSED,
            started_at=started_at,
            completed_at=completed_at,
        )

        result = self.repository.update(updated)

        self.assertEqual(result, updated)
        self.assertEqual(self.repository.get_by_id(original.id), updated)

    def test_update_raises_when_submission_does_not_exist(self) -> None:
        submission = self._submission(attempt_id=uuid4())

        with self.assertRaisesRegex(SubmissionNotFound, str(submission.id)):
            self.repository.update(submission)

    @staticmethod
    def _submission(
        *,
        attempt_id: UUID,
        sequence_number: int = 1,
    ) -> Submission:
        created_at = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
        return Submission(
            id=uuid4(),
            attempt_id=attempt_id,
            level_id="single-term-search",
            sequence_number=sequence_number,
            status=SubmissionStatus.RECEIVED,
            created_at=created_at,
            started_at=None,
            completed_at=None,
        )

    @staticmethod
    def _add_attempt() -> UUID:
        attempt = AttemptModel(
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            active_level_id="single-term-search",
        )
        db.session.add(attempt)
        db.session.commit()
        return attempt.id


if __name__ == "__main__":
    unittest.main()
