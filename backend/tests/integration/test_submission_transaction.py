import unittest
from dataclasses import replace
from datetime import datetime, timezone
from uuid import UUID, uuid4

from flask import Flask

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge_level import LevelProgressStatus
from app.domain.submission import Submission, SubmissionStatus
from app.extensions import db
from app.infrastructure.sqlalchemy_attempt_repository import (
    SQLAlchemyAttemptRepository,
)
from app.infrastructure.sqlalchemy_submission_repository import (
    SQLAlchemySubmissionRepository,
)
from app.infrastructure.sqlalchemy_transaction_manager import (
    SQLAlchemyTransactionManager,
)


class SubmissionTransactionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.init_app(self.app)
        db.create_all()
        self.attempt_repository = SQLAlchemyAttemptRepository(db)
        self.submission_repository = SQLAlchemySubmissionRepository(db)
        self.transaction_manager = SQLAlchemyTransactionManager(db)

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.app_context.pop()

    def test_commits_attempt_counter_and_submission_together(self) -> None:
        attempt = self._persist_attempt()
        submission = self._submission(attempt.id, sequence_number=1)

        with self.transaction_manager.transaction():
            self.attempt_repository.update(
                replace(attempt, submission_count=1),
            )
            self.submission_repository.add(submission)

        db.session.expire_all()
        stored_attempt = self.attempt_repository.get_by_id(attempt.id)
        stored_submission = self.submission_repository.get_by_id(submission.id)

        self.assertIsNotNone(stored_attempt)
        self.assertEqual(stored_attempt.submission_count, 1)
        self.assertEqual(stored_submission, submission)

    def test_rolls_back_attempt_counter_when_submission_write_fails(self) -> None:
        attempt = self._persist_attempt()
        submission = self._submission(attempt.id, sequence_number=1)

        with self.assertRaisesRegex(RuntimeError, "submission write failed"):
            with self.transaction_manager.transaction():
                self.attempt_repository.update(
                    replace(attempt, submission_count=1),
                )
                self.submission_repository.add(submission)
                raise RuntimeError("submission write failed")

        db.session.expire_all()
        stored_attempt = self.attempt_repository.get_by_id(attempt.id)

        self.assertIsNotNone(stored_attempt)
        self.assertEqual(stored_attempt.submission_count, 0)
        self.assertIsNone(self.submission_repository.get_by_id(submission.id))

    def _persist_attempt(self) -> Attempt:
        now = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
        attempt = Attempt(
            id=uuid4(),
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
            completed_at=None,
            active_level_id="single-term-search",
            submission_count=0,
            levels=(
                LevelProgress(
                    level_id="single-term-search",
                    status=LevelProgressStatus.ACTIVE,
                    submission_count=0,
                    completed_at=None,
                ),
            ),
        )
        with self.transaction_manager.transaction():
            return self.attempt_repository.add(attempt)

    @staticmethod
    def _submission(attempt_id: UUID, sequence_number: int) -> Submission:
        return Submission(
            id=uuid4(),
            attempt_id=attempt_id,
            level_id="single-term-search",
            sequence_number=sequence_number,
            status=SubmissionStatus.RECEIVED,
            created_at=datetime(2026, 11, 14, 12, tzinfo=timezone.utc),
            started_at=None,
            completed_at=None,
        )


if __name__ == "__main__":
    unittest.main()
