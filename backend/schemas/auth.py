from datetime import datetime

from backend.core.enums import CandidateStatus
from backend.schemas.common import ORMModel


class HRLoginRequest(ORMModel):
    username: str
    password: str


class HRLoginResponse(ORMModel):
    access_token: str
    hr_user_id: int
    name: str
    email: str
    username: str


class AdminLoginRequest(ORMModel):
    username: str
    password: str


class AdminLoginResponse(ORMModel):
    access_token: str
    admin_user_id: int
    name: str
    email: str
    username: str


class CandidateLoginRequest(ORMModel):
    username: str
    password: str


class CandidateApplicationSummary(ORMModel):
    candidate_id: int
    hr_user_id: int
    job_id: int
    job_title: str
    job_category: str
    job_description: str
    interview_token: str
    status: CandidateStatus
    applied_at: datetime
    hr_name: str
    invite_expires_at: datetime | None = None
    invite_expired: bool = False
    deadline_extension_requested_at: datetime | None = None
    deadline_extension_reason: str | None = None


class CandidateLoginResponse(ORMModel):
    access_token: str
    name: str
    username: str
    email: str
    current_role: str | None = None
    years_experience: int | None = None
    resume_url: str | None = None
    profile_completed: bool
    applications: list[CandidateApplicationSummary]


class CandidateDeadlineExtensionRequest(ORMModel):
    identifier: str
    password: str
    candidate_id: int
    reason: str


class CandidateDeadlineExtensionResponse(ORMModel):
    candidate_id: int
    deadline_extension_requested_at: datetime
    deadline_extension_reason: str
