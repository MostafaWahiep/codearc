from datetime import datetime, timezone
from uuid import UUID

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import select

from app.domain.submission import Submission
from app.infrastructure.database.submission_model import SubmissionModel
from app.repositories.submission_repository import (
    SubmissionNotFound,
    SubmissionRepository,
)


class SQLAlchemySubmissionRepository(SubmissionRepository):
    def __init__(self, db: SQLAlchemy) -> None:
        self._db = db

    def add(self, submission: Submission) -> Submission:
        model = self._map_submission_to_model(submission)
        self._db.session.add(model)
        self._commit()
        return self._map_model_to_domain(model)

    def update(self, submission: Submission) -> Submission:
        model = self._db.session.get(SubmissionModel, submission.id)
        if model is None:
            raise SubmissionNotFound(submission.id)

        model.status = submission.status
        model.started_at = submission.started_at
        model.completed_at = submission.completed_at
        self._commit()
        return self._map_model_to_domain(model)

    def get_by_id(self, submission_id: UUID) -> Submission | None:
        model = self._db.session.get(SubmissionModel, submission_id)
        return self._map_model_to_domain(model) if model is not None else None

    def list_for_attempt(self, attempt_id: UUID) -> list[Submission]:
        models = self._db.session.scalars(
            select(SubmissionModel)
            .where(SubmissionModel.attempt_id == attempt_id)
            .order_by(SubmissionModel.sequence_number.asc()),
        ).all()
        return [self._map_model_to_domain(model) for model in models]

    def _commit(self) -> None:
        try:
            self._db.session.commit()
        except Exception:
            self._db.session.rollback()
            raise

    @staticmethod
    def _map_submission_to_model(submission: Submission) -> SubmissionModel:
        return SubmissionModel(
            id=submission.id,
            attempt_id=submission.attempt_id,
            level_id=submission.level_id,
            sequence_number=submission.sequence_number,
            status=submission.status,
            created_at=submission.created_at,
            started_at=submission.started_at,
            completed_at=submission.completed_at,
        )

    @staticmethod
    def _map_model_to_domain(model: SubmissionModel) -> Submission:
        return Submission(
            id=model.id,
            attempt_id=model.attempt_id,
            level_id=model.level_id,
            sequence_number=model.sequence_number,
            status=model.status,
            created_at=SQLAlchemySubmissionRepository._as_utc(model.created_at),
            started_at=(
                SQLAlchemySubmissionRepository._as_utc(model.started_at)
                if model.started_at is not None
                else None
            ),
            completed_at=(
                SQLAlchemySubmissionRepository._as_utc(model.completed_at)
                if model.completed_at is not None
                else None
            ),
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
