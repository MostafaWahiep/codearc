import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from flask import Flask

from app.domain.attempt import Attempt, AttemptStatus, LevelProgress
from app.domain.challenge_level import LevelProgressStatus
from app.extensions import db
from app.infrastructure.database.attempt_models import (
    AttemptModel,
    LevelProgressModel,
)
from app.infrastructure.sqlalchemy_attempt_repository import (
    SQLAlchemyAttemptRepository,
)
from app.repositories.attempt_repository import AttemptNotFound


class SQLAlchemyAttemptRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.init_app(self.app)
        db.create_all()
        self.repository = SQLAlchemyAttemptRepository(db)

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.app_context.pop()

    def test_adds_and_retrieves_complete_attempt(self) -> None:
        attempt = self._attempt()

        added = self.repository.add(attempt)
        retrieved = self.repository.get_by_id(attempt.id)

        self.assertEqual(added, attempt)
        self.assertEqual(retrieved, attempt)

    def test_get_by_id_returns_none_for_unknown_attempt(self) -> None:
        self.assertIsNone(self.repository.get_by_id(uuid4()))

    def test_finds_matching_attempts_newest_first(self) -> None:
        user_id = uuid4()
        older = self._attempt(user_id=user_id)
        newer = self._attempt(
            user_id=user_id,
            started_at=older.started_at + timedelta(hours=1),
        )
        other_challenge = self._attempt(
            user_id=user_id,
            challenge_id="message-queue",
        )
        self.repository.add(older)
        self.repository.add(newer)
        self.repository.add(other_challenge)

        attempts = self.repository.find_by_user_and_challenge(
            user_id,
            "search-engine",
        )

        self.assertEqual([attempt.id for attempt in attempts], [newer.id, older.id])

    def test_updates_attempt_and_synchronizes_level_progress(self) -> None:
        original = self._attempt()
        self.repository.add(original)
        original_progress_id = db.session.scalar(
            db.select(LevelProgressModel.id).where(
                LevelProgressModel.attempt_id == original.id,
            ),
        )
        completion_time = original.updated_at + timedelta(minutes=5)
        updated = replace(
            original,
            active_level_id="prefix-search",
            updated_at=completion_time,
            levels=(
                replace(
                    original.levels[0],
                    status=LevelProgressStatus.COMPLETED,
                    submission_count=1,
                    completed_at=completion_time,
                ),
                LevelProgress(
                    level_id="prefix-search",
                    status=LevelProgressStatus.ACTIVE,
                    submission_count=0,
                    completed_at=None,
                ),
            ),
        )

        result = self.repository.update(updated)

        self.assertEqual(result, updated)
        progress_models = db.session.scalars(
            db.select(LevelProgressModel).where(
                LevelProgressModel.attempt_id == original.id,
            ),
        ).all()
        self.assertEqual(len(progress_models), 2)
        progress_by_level = {
            progress.level_id: progress
            for progress in progress_models
        }
        self.assertEqual(
            progress_by_level["single-term-search"].id,
            original_progress_id,
        )
        self.assertEqual(
            progress_by_level["single-term-search"].status,
            LevelProgressStatus.COMPLETED,
        )
        self.assertEqual(
            progress_by_level["prefix-search"].status,
            LevelProgressStatus.ACTIVE,
        )

    def test_update_raises_when_attempt_does_not_exist(self) -> None:
        attempt = self._attempt()

        with self.assertRaisesRegex(AttemptNotFound, str(attempt.id)):
            self.repository.update(attempt)

    @staticmethod
    def _attempt(
        *,
        user_id: UUID | None = None,
        challenge_id: str = "search-engine",
        started_at: datetime | None = None,
    ) -> Attempt:
        start = started_at or datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
        return Attempt(
            id=uuid4(),
            user_id=user_id or uuid4(),
            challenge_id=challenge_id,
            challenge_version="1",
            status=AttemptStatus.IN_PROGRESS,
            started_at=start,
            updated_at=start,
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


if __name__ == "__main__":
    unittest.main()
