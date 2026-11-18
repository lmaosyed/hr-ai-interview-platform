from sqlalchemy import Enum, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.enums import IntegrityEventType, SeverityLevel
from backend.models.base import Base


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    event_type: Mapped[IntegrityEventType] = mapped_column(
        Enum(IntegrityEventType, name="integrity_event_type"),
        nullable=False,
    )
    timestamp_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    severity: Mapped[SeverityLevel] = mapped_column(
        Enum(SeverityLevel, name="severity_level"),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)

    session = relationship("Session", back_populates="integrity_events")
