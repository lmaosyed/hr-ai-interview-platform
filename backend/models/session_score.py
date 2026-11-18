from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.enums import HireSignal, RiskLevel
from backend.models.base import Base


class SessionScore(Base):
    __tablename__ = "session_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, unique=True)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    answer_quality_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    integrity_score: Mapped[float] = mapped_column(Float, nullable=False)
    communication_score: Mapped[float] = mapped_column(Float, nullable=False)
    hire_signal: Mapped[HireSignal] = mapped_column(
        Enum(HireSignal, name="hire_signal"),
        nullable=False,
    )
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False)
    scored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Explainability + timeline data make the scoring easier to defend in demos.
    explainability: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    score_breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    timeline_events: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    risk_level: Mapped[RiskLevel | None] = mapped_column(Enum(RiskLevel, name="risk_level"))

    session = relationship("Session", back_populates="session_score")
