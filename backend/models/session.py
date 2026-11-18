from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.enums import ProcessingStatus
from backend.models.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    raw_video_path: Mapped[str | None] = mapped_column(String(500))
    raw_screen_path: Mapped[str | None] = mapped_column(String(500))
    raw_audio_path: Mapped[str | None] = mapped_column(String(500))
    raw_gaze_path: Mapped[str | None] = mapped_column(String(500))
    raw_integrity_path: Mapped[str | None] = mapped_column(String(500))
    raw_answers_path: Mapped[str | None] = mapped_column(String(500))
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus, name="processing_status"),
        default=ProcessingStatus.pending,
        nullable=False,
    )

    candidate = relationship("Candidate", back_populates="sessions")
    session_score = relationship(
        "SessionScore",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )
    question_responses = relationship(
        "QuestionResponse",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    integrity_events = relationship(
        "IntegrityEvent",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    gaze_snapshots = relationship(
        "GazeSnapshot",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    hr_notes = relationship("HRNote", back_populates="session", cascade="all, delete-orphan")
    pipeline_runs = relationship(
        "PipelineRun",
        back_populates="session",
        cascade="all, delete-orphan",
    )
