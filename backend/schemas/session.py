from datetime import datetime
from typing import Any

from backend.core.enums import InterviewTimeMode, ProcessingStatus
from backend.schemas.common import ORMModel
from backend.schemas.job import JobQuestion


class InterviewAccessRequest(ORMModel):
    username: str | None = None
    token: str


class InterviewContextResponse(ORMModel):
    candidate_id: int
    candidate_name: str
    candidate_username: str
    hr_name: str
    job_id: int
    job_title: str
    job_category: str
    job_description: str
    questions: list[JobQuestion]
    time_mode: InterviewTimeMode
    time_limit_per_question: int | None
    invite_expires_at: datetime | None = None


class SessionUploadResponse(ORMModel):
    session_id: int
    processing_status: ProcessingStatus


class SessionStatusResponse(ORMModel):
    session_id: int
    processing_status: ProcessingStatus


class SessionUploadMetadata(ORMModel):
    candidate_id: int
    started_at: datetime
    ended_at: datetime
    duration_seconds: int
    gaze_data: list[dict[str, Any]]
    integrity_events: list[dict[str, Any]]
