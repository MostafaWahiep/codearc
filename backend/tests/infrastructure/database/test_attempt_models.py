import unittest
from uuid import uuid4

from flask import Flask
from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.domain.attempt import AttemptStatus
from app.domain.challenge_level import LevelProgressStatus
from app.extensions import db
from app.infrastructure.database.attempt_models import (
    AttemptModel,
    LevelProgressModel,
)


class AttemptModelTests(unittest.TestCase):
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

    def test_persists_attempt_with_active_level_progress(self) -> None:
        attempt = AttemptModel(
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            active_level_id="single-term-search",
        )
        attempt.levels.append(
            LevelProgressModel(level_id="single-term-search"),
        )
        db.session.add(attempt)
        db.session.commit()

        loaded = db.session.get(AttemptModel, attempt.id)

        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.status, AttemptStatus.IN_PROGRESS)
        self.assertEqual(loaded.levels[0].status, LevelProgressStatus.ACTIVE)
        self.assertEqual(loaded.levels[0].submission_count, 0)
        self.assertEqual(loaded.levels[0].attempt_id, loaded.id)
        self.assertIsNotNone(loaded.started_at)
        self.assertIsNotNone(loaded.updated_at)

        stored_attempt_status = db.session.execute(
            text("SELECT status FROM attempts"),
        ).scalar_one()
        stored_level_status = db.session.execute(
            text("SELECT status FROM level_progress"),
        ).scalar_one()
        self.assertEqual(stored_attempt_status, "in_progress")
        self.assertEqual(stored_level_status, "active")

    def test_creates_expected_attempt_schema(self) -> None:
        inspector = inspect(db.engine)

        self.assertEqual(
            set(inspector.get_table_names()),
            {"attempts", "level_progress"},
        )

        attempt_columns = {
            column["name"]: column
            for column in inspector.get_columns("attempts")
        }
        self.assertEqual(
            set(attempt_columns),
            {
                "id",
                "user_id",
                "challenge_id",
                "challenge_version",
                "status",
                "active_level_id",
                "started_at",
                "updated_at",
                "completed_at",
            },
        )
        self.assertFalse(attempt_columns["id"]["nullable"])
        self.assertFalse(attempt_columns["user_id"]["nullable"])
        self.assertFalse(attempt_columns["challenge_id"]["nullable"])
        self.assertTrue(attempt_columns["active_level_id"]["nullable"])
        self.assertTrue(attempt_columns["completed_at"]["nullable"])
        self.assertEqual(
            inspector.get_pk_constraint("attempts")["constrained_columns"],
            ["id"],
        )

        attempt_checks = {
            constraint["name"]: constraint["sqltext"]
            for constraint in inspector.get_check_constraints("attempts")
        }
        self.assertEqual(
            attempt_checks["attempt_status"],
            "status IN ('in_progress', 'completed')",
        )

        attempt_indexes = {
            index["name"]: index["column_names"]
            for index in inspector.get_indexes("attempts")
        }
        self.assertEqual(
            attempt_indexes["ix_attempts_user_challenge"],
            ["user_id", "challenge_id"],
        )
        self.assertEqual(
            attempt_indexes["ix_attempts_challenge_id"],
            ["challenge_id"],
        )

    def test_creates_expected_level_progress_schema(self) -> None:
        inspector = inspect(db.engine)

        progress_columns = {
            column["name"]: column
            for column in inspector.get_columns("level_progress")
        }
        self.assertEqual(
            set(progress_columns),
            {
                "id",
                "attempt_id",
                "level_id",
                "status",
                "submission_count",
                "completed_at",
                "updated_at",
            },
        )
        self.assertFalse(progress_columns["attempt_id"]["nullable"])
        self.assertFalse(progress_columns["submission_count"]["nullable"])
        self.assertTrue(progress_columns["completed_at"]["nullable"])

        foreign_keys = inspector.get_foreign_keys("level_progress")
        self.assertEqual(len(foreign_keys), 1)
        self.assertEqual(foreign_keys[0]["constrained_columns"], ["attempt_id"])
        self.assertEqual(foreign_keys[0]["referred_table"], "attempts")
        self.assertEqual(foreign_keys[0]["referred_columns"], ["id"])
        self.assertEqual(foreign_keys[0]["options"].get("ondelete"), "CASCADE")

        unique_constraints = {
            constraint["name"]: constraint["column_names"]
            for constraint in inspector.get_unique_constraints("level_progress")
        }
        self.assertEqual(
            unique_constraints["uq_level_progress_attempt_level"],
            ["attempt_id", "level_id"],
        )

        check_constraints = {
            constraint["name"]: constraint["sqltext"]
            for constraint in inspector.get_check_constraints("level_progress")
        }
        self.assertEqual(
            check_constraints["ck_level_progress_submission_count_nonnegative"],
            "submission_count >= 0",
        )
        self.assertEqual(
            check_constraints["level_progress_status"],
            "status IN ('active', 'completed')",
        )

    def test_rejects_duplicate_level_progress_for_an_attempt(self) -> None:
        attempt = AttemptModel(
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            active_level_id="single-term-search",
            levels=[
                LevelProgressModel(level_id="single-term-search"),
                LevelProgressModel(level_id="single-term-search"),
            ],
        )
        db.session.add(attempt)

        with self.assertRaises(IntegrityError):
            db.session.commit()

    def test_enforces_level_progress_foreign_key(self) -> None:
        foreign_keys_enabled = db.session.execute(
            text("PRAGMA foreign_keys"),
        ).scalar_one()
        self.assertEqual(foreign_keys_enabled, 1)

        db.session.add(
            LevelProgressModel(
                attempt_id=uuid4(),
                level_id="single-term-search",
            ),
        )

        with self.assertRaises(IntegrityError):
            db.session.commit()

    def test_database_cascades_progress_when_attempt_is_deleted(self) -> None:
        attempt = AttemptModel(
            user_id=uuid4(),
            challenge_id="search-engine",
            challenge_version="1",
            active_level_id="single-term-search",
            levels=[LevelProgressModel(level_id="single-term-search")],
        )
        db.session.add(attempt)
        db.session.commit()

        db.session.execute(
            delete(AttemptModel)
            .where(AttemptModel.id == attempt.id)
            .execution_options(synchronize_session=False),
        )
        db.session.commit()

        progress_count = db.session.scalar(
            select(func.count()).select_from(LevelProgressModel),
        )
        self.assertEqual(progress_count, 0)


if __name__ == "__main__":
    unittest.main()
