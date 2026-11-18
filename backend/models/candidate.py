from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.enums import CandidateStatus
from backend.models.base import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    hr_user_id: Mapped[int] = mapped_column(ForeignKey("hr_users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False, index=True)
    resume_url: Mapped[str | None] = mapped_column(String(500))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[CandidateStatus] = mapped_column(
        Enum(CandidateStatus, name="candidate_status"),
        default=CandidateStatus.pending,
        nullable=False,
    )

    # Simple login credentials are acceptable for a college demo, but would need
    # proper hashing and session management in a production system.
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    interview_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_extension_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_extension_reason: Mapped[str | None] = mapped_column(Text)
    current_role: Mapped[str | None] = mapped_column(String(255))
    years_experience: Mapped[int | None]

    hr_user = relationship("HRUser", back_populates="candidates")
    job = relationship("Job", back_populates="candidates")
    sessions = relationship("Session", back_populates="candidate", cascade="all, delete-orphan")
