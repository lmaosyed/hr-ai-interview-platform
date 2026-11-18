from datetime import datetime

from pydantic import EmailStr, Field

from backend.schemas.common import ORMModel


class HRUserCreate(ORMModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=6, max_length=128)


class HRUserStatusUpdate(ORMModel):
    is_active: bool


class AdminMetrics(ORMModel):
    total_hrs: int
    active_hrs: int
    suspended_hrs: int
    total_candidates: int
    total_templates: int
    pending_decisions: int


class AdminCandidateSummary(ORMModel):
    id: int
    name: str
    username: str
    email: EmailStr
    status: str
    job_title: str
    job_category: str
    applied_at: datetime


class AdminHRUserRead(ORMModel):
    id: int
    name: str
    email: EmailStr
    username: str
    is_active: bool
    created_at: datetime
    job_count: int
    candidate_count: int
    candidates: list[AdminCandidateSummary]


class AdminDashboardResponse(ORMModel):
    metrics: AdminMetrics
    hr_users: list[AdminHRUserRead]


class SystemStatus(ORMModel):
    checked_at: datetime
    database_ready: bool
    queue_ready: bool
    worker_ready: bool
    ai_state: str
    ai_message: str
    ai_model: str
    email_mode: str
    email_message: str
    local_inbox_url: str | None = None
