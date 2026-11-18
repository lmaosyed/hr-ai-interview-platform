from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field

from backend.core.enums import CandidateStatus, HireSignal, IntegrityEventType, RiskLevel, SeverityLevel
from backend.schemas.common import ORMModel


class SessionScoreSummary(ORMModel):
    overall_score: float | None = None
    answer_quality_score: float | None = None
    confidence_score: float | None = None
    integrity_score: float | None = None
    communication_score: float | None = None
    hire_signal: HireSignal | None = None
    ai_summary: str | None = None
    risk_level: RiskLevel | None = None
    explainability: dict[str, Any] | None = None
    score_breakdown: dict[str, Any] | None = None
    timeline_events: list[dict[str, Any]] | None = None


class IntegrityEventRead(ORMModel):
    id: int
    event_type: IntegrityEventType
    timestamp_seconds: float
    duration_seconds: float = 0
    severity: SeverityLevel
    description: str


class QuestionResponseRead(ORMModel):
    id: int
    question_index: int
    question_text: str
    response_type: str | None = None
    helper_text: str | None = None
    transcript: str
    answer_quality_score: float
    relevance_score: float
    depth_score: float
    confidence_score: float
    communication_score: float | None = None
    duration_seconds: int
    difficulty_weight: float
    ai_summary: str | None = None
    transcript_start_seconds: float | None = None
    transcript_end_seconds: float | None = None
    score_rationale: dict[str, Any] | None = None
    highlight_moments: list[dict[str, Any]] | None = None
    transcript_timestamps: list[dict[str, Any]] | None = None


class TypedResponseRead(ORMModel):
    question_index: int
    question_text: str
    response_type: str
    answer_text: str
    helper_text: str | None = None
    starter_code: str | None = None


class HRNoteRead(ORMModel):
    id: int
    hr_user: str
    note: str
    created_at: datetime


class CandidateListItem(ORMModel):
    id: int
    hr_user_id: int
    job_id: int
    name: str
    email: EmailStr
    username: str
    status: CandidateStatus
    applied_at: datetime
    current_role: str | None = None
    years_experience: int | None = None
    job_category: str | None = None
    latest_session_id: int | None = None
    latest_session_duration_seconds: int | None = None
    top_integrity_flags: list[str] = Field(default_factory=list)
    session_score: SessionScoreSummary | None = None


class CandidateDetail(ORMModel):
    processing_error: str | None = None
    id: int
    hr_user_id: int
    job_id: int
    name: str
    email: EmailStr
    username: str
    status: CandidateStatus
    resume_url: str | None = None
    deadline_extension_requested_at: datetime | None = None
    deadline_extension_reason: str | None = None
    applied_at: datetime
    current_role: str | None = None
    years_experience: int | None = None
    job_title: str
    job_category: str
    time_mode: str | None = None
    time_limit_per_question: int | None = None
    session_id: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = None
    raw_video_path: str | None = None
    raw_screen_path: str | None = None
    processing_status: str | None = None
    session_score: SessionScoreSummary | None = None
    integrity_events: list[IntegrityEventRead] = Field(default_factory=list)
    question_responses: list[QuestionResponseRead] = Field(default_factory=list)
    typed_responses: list[TypedResponseRead] = Field(default_factory=list)
    hr_notes: list[HRNoteRead] = Field(default_factory=list)


class CandidateStatusUpdate(ORMModel):
    status: CandidateStatus


class CandidateStatusResponse(ORMModel):
    candidate_id: int
    status: CandidateStatus


class CandidateDeadlineExtensionUpdate(ORMModel):
    invite_expiry_hours: int | None = 24


class CandidateDeadlineExtensionUpdateResponse(ORMModel):
    candidate_id: int
    invite_expires_at: datetime | None = None


class HRNoteCreate(ORMModel):
    hr_user: str
    note: str = Field(..., min_length=1)


class HRNoteCreateResponse(ORMModel):
    note: HRNoteRead


class CandidateInviteCreate(ORMModel):
    hr_user_id: int
    job_id: int
    name: str | None = None
    email: EmailStr
    username: str | None = None
    password: str | None = None
    invite_expiry_hours: int | None = 24


class BulkCandidateInviteItem(ORMModel):
    email: EmailStr
    name: str | None = None


class BulkCandidateInviteCreate(ORMModel):
    hr_user_id: int
    job_id: int
    candidates: list[BulkCandidateInviteItem] = Field(min_length=1, max_length=100)
    invite_expiry_hours: int | None = 24


class CandidateInviteResponse(ORMModel):
    candidate_id: int
    hr_user_id: int
    job_id: int
    candidate_name: str
    candidate_email: EmailStr
    username: str
    password: str
    interview_token: str
    job_title: str
    job_category: str
    time_mode: str
    time_limit_per_question: int | None = None
    login_identifier: EmailStr
    invite_url: str
    invite_expires_at: datetime | None = None
    email_sent: bool = False
    email_error: str | None = None
    mailbox_preview_url: str | None = None
