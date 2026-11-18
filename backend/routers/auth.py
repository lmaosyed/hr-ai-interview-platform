from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.database import get_db_session
from backend.core.enums import CandidateStatus
from backend.core.security import hash_password, issue_token, verify_password
from backend.models.admin_user import AdminUser
from backend.models.candidate import Candidate
from backend.models.hr_user import HRUser
from backend.schemas.auth import (
    AdminLoginRequest,
    AdminLoginResponse,
    CandidateApplicationSummary,
    CandidateDeadlineExtensionRequest,
    CandidateDeadlineExtensionResponse,
    CandidateLoginRequest,
    CandidateLoginResponse,
    HRLoginRequest,
    HRLoginResponse,
)
from backend.services.storage import save_upload_file


router = APIRouter(prefix="/auth", tags=["auth"])


def _public_storage_path(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/")
    return f"/{normalized}" if not normalized.startswith("/") else normalized


def _profile_completed(candidate: Candidate) -> bool:
    return bool(candidate.name and candidate.current_role and candidate.resume_url and candidate.years_experience is not None)


def _build_candidate_response(
    login_identifier: str,
    candidates: list[Candidate],
) -> CandidateLoginResponse:
    primary = candidates[0]
    display_name = primary.name or login_identifier.split("@")[0].replace(".", " ").replace("_", " ").title()
    applications = [
        CandidateApplicationSummary(
            candidate_id=candidate.id,
            hr_user_id=candidate.hr_user_id,
            job_id=candidate.job_id,
            job_title=candidate.job.title if candidate.job else "Unknown role",
            job_category=candidate.job.category if candidate.job else "Unknown category",
            job_description=candidate.job.description if candidate.job else "",
            interview_token=candidate.interview_token,
            status=candidate.status,
            applied_at=candidate.applied_at,
            hr_name=candidate.hr_user.name if candidate.hr_user else "HR team",
            invite_expires_at=candidate.invite_expires_at,
            invite_expired=bool(
                candidate.invite_expires_at and datetime.now(timezone.utc) > candidate.invite_expires_at
            ),
            deadline_extension_requested_at=candidate.deadline_extension_requested_at,
            deadline_extension_reason=candidate.deadline_extension_reason,
        )
        for candidate in sorted(candidates, key=lambda item: item.applied_at, reverse=True)
    ]
    return CandidateLoginResponse(
        access_token=issue_token("candidate", primary.email),
        name=display_name,
        username=login_identifier,
        email=primary.email,
        current_role=primary.current_role,
        years_experience=primary.years_experience,
        resume_url=_public_storage_path(primary.resume_url),
        profile_completed=_profile_completed(primary),
        applications=applications,
    )


async def _load_candidate_applications(
    db: AsyncSession,
    login_identifier: str,
    password: str,
) -> list[Candidate]:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.job),
            selectinload(Candidate.hr_user),
        )
        .where(
            or_(Candidate.username == login_identifier.strip(), Candidate.email == login_identifier.strip().lower()),
            Candidate.password == password,
        )
        .order_by(Candidate.applied_at.desc())
    )
    return list((await db.execute(query)).scalars().unique().all())


@router.post("/hr/login", response_model=HRLoginResponse)
async def login_hr(
    payload: HRLoginRequest,
    db: AsyncSession = Depends(get_db_session),
) -> HRLoginResponse:
    query = select(HRUser).where(HRUser.username == payload.username.strip())
    hr_user = (await db.execute(query)).scalar_one_or_none()
    if not hr_user or not hr_user.is_active or not verify_password(payload.password, hr_user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid HR credentials.")
    if not hr_user.password.startswith("scrypt$"):
        hr_user.password = hash_password(payload.password)
        await db.commit()
    return HRLoginResponse(access_token=issue_token("hr", hr_user.id), hr_user_id=hr_user.id, name=hr_user.name, email=hr_user.email, username=hr_user.username)


@router.post("/admin/login", response_model=AdminLoginResponse)
async def login_admin(
    payload: AdminLoginRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AdminLoginResponse:
    query = select(AdminUser).where(
        AdminUser.username == payload.username.strip(),
    )
    admin_user = (await db.execute(query)).scalar_one_or_none()
    if not admin_user or not admin_user.is_active or not verify_password(payload.password, admin_user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials.")
    return AdminLoginResponse(
        access_token=issue_token("admin", admin_user.id),
        admin_user_id=admin_user.id,
        name=admin_user.name,
        email=admin_user.email,
        username=admin_user.username,
    )


@router.post("/candidate/login", response_model=CandidateLoginResponse)
async def login_candidate(
    payload: CandidateLoginRequest,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateLoginResponse:
    candidates = await _load_candidate_applications(db, payload.username, payload.password)
    if not candidates:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid candidate credentials.")
    return _build_candidate_response(payload.username, candidates)


@router.post("/candidate/profile", response_model=CandidateLoginResponse)
async def update_candidate_profile(
    identifier: str = Form(...),
    password: str = Form(...),
    name: str = Form(...),
    current_role: str = Form(...),
    years_experience: int | None = Form(default=None),
    resume: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> CandidateLoginResponse:
    candidates = await _load_candidate_applications(db, identifier, password)
    if not candidates:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid candidate credentials.")

    if not name.strip() or not current_role.strip():
        raise HTTPException(422, "Full name and current role or course are required.")
    if years_experience is None or not 0 <= years_experience <= 80:
        raise HTTPException(422, "Enter years of experience between 0 and 80.")
    if not candidates[0].resume_url and not (resume and resume.filename):
        raise HTTPException(422, "Upload your resume before continuing.")
    resume_path: str | None = None
    if resume and resume.filename:
        extension = Path(resume.filename).suffix.lower()
        if extension not in {".pdf", ".doc", ".docx"}:
            raise HTTPException(422, "Resume must be a PDF, DOC, or DOCX file.")
        if resume.size and resume.size > 10 * 1024 * 1024:
            raise HTTPException(422, "Resume must be smaller than 10 MB.")
        destination = Path("storage") / "raw" / "candidate_profiles" / uuid4().hex / f"resume{extension}"
        resume_path = _public_storage_path(await save_upload_file(resume, destination))

    for candidate in candidates:
        candidate.name = name
        candidate.current_role = current_role
        candidate.years_experience = years_experience
        if resume_path:
            candidate.resume_url = resume_path

    await db.commit()
    refreshed_candidates = await _load_candidate_applications(db, identifier, password)
    return _build_candidate_response(identifier, refreshed_candidates)


@router.post("/candidate/extensions/request", response_model=CandidateDeadlineExtensionResponse)
async def request_deadline_extension(
    payload: CandidateDeadlineExtensionRequest,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateDeadlineExtensionResponse:
    candidates = await _load_candidate_applications(db, payload.identifier, payload.password)
    if not candidates:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid candidate credentials.")

    candidate = next((item for item in candidates if item.id == payload.candidate_id), None)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate application not found.")
    if candidate.status != CandidateStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending interviews can request a deadline extension.",
        )
    if candidate.invite_expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview does not have a deadline to extend.",
        )

    candidate.deadline_extension_requested_at = datetime.now(timezone.utc)
    candidate.deadline_extension_reason = payload.reason.strip()
    await db.commit()

    return CandidateDeadlineExtensionResponse(
        candidate_id=candidate.id,
        deadline_extension_requested_at=candidate.deadline_extension_requested_at,
        deadline_extension_reason=candidate.deadline_extension_reason or "",
    )
