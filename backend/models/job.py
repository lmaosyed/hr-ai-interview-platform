from typing import Any

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.enums import InterviewTimeMode
from backend.models.base import Base, TimestampMixin


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    hr_user_id: Mapped[int] = mapped_column(ForeignKey("hr_users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    time_mode: Mapped[InterviewTimeMode] = mapped_column(
        Enum(InterviewTimeMode, name="interview_time_mode"),
        nullable=False,
        default=InterviewTimeMode.fixed,
    )
    time_limit_per_question: Mapped[int | None] = mapped_column(Integer)

    hr_user = relationship("HRUser", back_populates="jobs")
    candidates = relationship("Candidate", back_populates="job", cascade="all, delete-orphan")
