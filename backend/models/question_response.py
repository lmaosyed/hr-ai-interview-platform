from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class QuestionResponse(Base):
    __tablename__ = "question_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    question_index: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_type: Mapped[str | None] = mapped_column(String(32))
    helper_text: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    answer_quality_score: Mapped[float] = mapped_column(Float, nullable=False)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False)
    depth_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    communication_score: Mapped[float | None] = mapped_column(Float)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty_weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    transcript_start_seconds: Mapped[float | None] = mapped_column(Float)
    transcript_end_seconds: Mapped[float | None] = mapped_column(Float)
    score_rationale: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    highlight_moments: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    transcript_timestamps: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    session = relationship("Session", back_populates="question_responses")
