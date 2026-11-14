from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.submission import SubmissionStatus
from app.extensions import db
from app.infrastructure.database.utils import _enum_values, _utc_now


class SubmissionModel(db.Model):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "sequence_number",
            name="uq_submissions_attempt_sequence",
        ),
        CheckConstraint(
            "sequence_number > 0",
            name="ck_submissions_sequence_number_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"),
        index=True,
    )
    level_id: Mapped[str] = mapped_column(String(100))
    sequence_number: Mapped[int] = mapped_column()
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(
            SubmissionStatus,
            name="submission_status",
            native_enum=False,
            create_constraint=True,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        default=SubmissionStatus.RECEIVED,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
