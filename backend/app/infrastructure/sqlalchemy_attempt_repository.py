from datetime import datetime, timezone
from uuid import UUID

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import select

from app.domain.attempt import Attempt, LevelProgress
from app.infrastructure.database.attempt_models import (
    AttemptModel,
    LevelProgressModel,
)
from app.repositories.attempt_repository import (
    AttemptNotFound,
    AttemptRepository,
)


class SQLAlchemyAttemptRepository(AttemptRepository):
    def __init__(self, db: SQLAlchemy) -> None:
        self._db = db

    def add(self, attempt: Attempt) -> Attempt:
        model = self._map_attempt_to_model(attempt)
        self._db.session.add(model)
        self._db.session.flush()
        return self._map_model_to_domain(model)

    def update(self, attempt: Attempt) -> Attempt:
        model = self._db.session.get(AttemptModel, attempt.id)

        if model is None:
            raise AttemptNotFound(attempt.id)

        model.status = attempt.status
        model.active_level_id = attempt.active_level_id
        model.updated_at = attempt.updated_at
        model.completed_at = attempt.completed_at
        model.submission_count = attempt.submission_count
        self._synchronize_level_progress(model, attempt.levels)

        self._db.session.flush()
        return self._map_model_to_domain(model)

    def get_by_id(self, attempt_id: UUID) -> Attempt | None:
        model = self._db.session.get(AttemptModel, attempt_id)
        return self._map_model_to_domain(model) if model is not None else None

    def get_by_id_for_update(self, attempt_id: UUID) -> Attempt | None:
        model = self._db.session.scalar(
            select(AttemptModel)
            .where(AttemptModel.id == attempt_id)
            .with_for_update(),
        )
        return self._map_model_to_domain(model) if model is not None else None

    def find_by_user_and_challenge(
        self,
        user_id: UUID,
        challenge_id: str,
    ) -> list[Attempt]:
        models = self._db.session.scalars(
            select(AttemptModel)
            .where(
                AttemptModel.user_id == user_id,
                AttemptModel.challenge_id == challenge_id,
            )
            .order_by(AttemptModel.started_at.desc())
        ).all()
        return [self._map_model_to_domain(model) for model in models]

    def _synchronize_level_progress(
        self,
        model: AttemptModel,
        progress_entries: tuple[LevelProgress, ...],
    ) -> None:
        existing_by_level_id = {
            progress.level_id: progress
            for progress in model.levels
        }

        for entry in progress_entries:
            progress_model = existing_by_level_id.get(entry.level_id)
            if progress_model is None:
                model.levels.append(self._map_level_progress_to_model(entry))
                continue

            progress_model.status = entry.status
            progress_model.submission_count = entry.submission_count
            progress_model.completed_at = entry.completed_at

    @staticmethod
    def _map_attempt_to_model(attempt: Attempt) -> AttemptModel:
        return AttemptModel(
            id=attempt.id,
            user_id=attempt.user_id,
            challenge_id=attempt.challenge_id,
            challenge_version=attempt.challenge_version,
            active_level_id=attempt.active_level_id,
            status=attempt.status,
            started_at=attempt.started_at,
            updated_at=attempt.updated_at,
            completed_at=attempt.completed_at,
            submission_count=attempt.submission_count,
            levels=[
                SQLAlchemyAttemptRepository._map_level_progress_to_model(progress)
                for progress in attempt.levels
            ],
        )

    @staticmethod
    def _map_level_progress_to_model(
        progress: LevelProgress,
    ) -> LevelProgressModel:
        return LevelProgressModel(
            level_id=progress.level_id,
            status=progress.status,
            submission_count=progress.submission_count,
            completed_at=progress.completed_at,
        )

    @staticmethod
    def _map_model_to_domain(model: AttemptModel) -> Attempt:
        return Attempt(
            id=model.id,
            user_id=model.user_id,
            challenge_id=model.challenge_id,
            challenge_version=model.challenge_version,
            status=model.status,
            started_at=SQLAlchemyAttemptRepository._as_utc(model.started_at),
            updated_at=SQLAlchemyAttemptRepository._as_utc(model.updated_at),
            completed_at=(
                SQLAlchemyAttemptRepository._as_utc(model.completed_at)
                if model.completed_at is not None
                else None
            ),
            active_level_id=model.active_level_id,
            submission_count=model.submission_count,
            levels=tuple(
                SQLAlchemyAttemptRepository._map_level_progress_model_to_domain(
                    progress,
                )
                for progress in model.levels
            ),
        )

    @staticmethod
    def _map_level_progress_model_to_domain(
        model: LevelProgressModel,
    ) -> LevelProgress:
        return LevelProgress(
            level_id=model.level_id,
            status=model.status,
            submission_count=model.submission_count,
            completed_at=(
                SQLAlchemyAttemptRepository._as_utc(model.completed_at)
                if model.completed_at is not None
                else None
            ),
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
