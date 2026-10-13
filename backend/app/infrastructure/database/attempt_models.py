from datetime import datetime, timezone
from enum import Enum as PythonEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.attempt import AttemptStatus
from app.domain.challenge_level import LevelProgressStatus
from app.extensions import db


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _enum_values(enum_class: type[PythonEnum]) -> list[str]:
    return [member.value for member in enum_class]


class AttemptModel(db.Model):
    __tablename__ = "attempts"
    __table_args__ = (
        Index(
            "ix_attempts_user_challenge",
            "user_id",
            "challenge_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column()
    challenge_id: Mapped[str] = mapped_column(String(100), index=True)
    challenge_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(
            AttemptStatus,
            name="attempt_status",
            native_enum=False,
            create_constraint=True,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        default=AttemptStatus.IN_PROGRESS,
    )
    active_level_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        onupdate=_utc_now,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    levels: Mapped[list["LevelProgressModel"]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class LevelProgressModel(db.Model):
    __tablename__ = "level_progress"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "level_id",
            name="uq_level_progress_attempt_level",
        ),
        CheckConstraint(
            "submission_count >= 0",
            name="ck_level_progress_submission_count_nonnegative",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"),
        index=True,
    )
    level_id: Mapped[str] = mapped_column(String(100))
    status: Mapped[LevelProgressStatus] = mapped_column(
        Enum(
            LevelProgressStatus,
            name="level_progress_status",
            native_enum=False,
            create_constraint=True,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        default=LevelProgressStatus.ACTIVE,
    )
    submission_count: Mapped[int] = mapped_column(default=0)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        onupdate=_utc_now,
    )

    attempt: Mapped[AttemptModel] = relationship(back_populates="levels")
