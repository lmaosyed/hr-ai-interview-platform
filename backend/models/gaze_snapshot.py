from sqlalchemy import Boolean, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class GazeSnapshot(Base):
    __tablename__ = "gaze_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    timestamp_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    gaze_x: Mapped[float] = mapped_column(Float, nullable=False)
    gaze_y: Mapped[float] = mapped_column(Float, nullable=False)
    is_on_screen: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    session = relationship("Session", back_populates="gaze_snapshots")
