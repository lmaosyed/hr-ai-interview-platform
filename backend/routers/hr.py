from datetime import datetime, timedelta, timezone
from secrets import choice
from string import ascii_letters, digits
from urllib.parse import quote_plus
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.config import get_settings
from backend.core.database import get_db_session
from backend.core.enums import CandidateStatus
from backend.core.enums import ProcessingStatus
from backend.services.queue import enqueue_session
from backend.core.security import require_hr
from starlette.concurrency import run_in_threadpool
from backend.models.candidate import Candidate
from backend.models.hr_note import HRNote
from backend.models.hr_user import HRUser
from backend.models.job import Job
from backend.models.session import Session
from backend.schemas.analytics import JobAnalyticsResponse
from backend.schemas.candidate import (
    BulkCandidateInviteCreate,
    CandidateDetail,
    CandidateDeadlineExtensionUpdate,
    CandidateDeadlineExtensionUpdateResponse,
    CandidateInviteCreate,
    CandidateInviteResponse,
    CandidateListItem,
    CandidateStatusResponse,
    CandidateStatusUpdate,
    HRNoteCreate,
    HRNoteCreateResponse,
    HRNoteRead,
    IntegrityEventRead,
    QuestionResponseRead,
    SessionScoreSummary,
)
from backend.schemas.job import (
    JobCreate,
    JobListItem,
    JobQuestionQualityCheckRequest,
    JobQuestionQualityCheckResponse,
    JobRead,
    JobUpdate,
)
from backend.services.analytics import build_job_analytics
from backend.services.email import build_interview_invitation_email, send_email
from backend.services.question_quality import assess_question_quality
from backend.services.scoring import top_flag_descriptions
from backend.services.storage import load_json


router = APIRouter(prefix="/hr", tags=["hr"], dependencies=[Depends(require_hr)])
settings = get_settings()
ALLOWED_INVITE_EXPIRY_HOURS = {12, 24, 48, 72}


def _public_storage_path(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/")
    return f"/{normalized}" if not normalized.startswith("/") else normalized


def _derive_display_name(email: str, provided_name: str | None) -> str:
    if provided_name and provided_name.strip():
        return provided_name.strip()
    local_part = email.split("@")[0].replace(".", " ").replace("_", " ").replace("-", " ")
    return " ".join(part.capitalize() for part in local_part.split())


def _generate_password(length: int = 10) -> str:
    alphabet = ascii_letters + digits
    return "".join(choice(alphabet) for _ in range(length))


async def _generate_unique_candidate_username(db: AsyncSession, desired: str) -> str:
    base = desired.strip().lower().replace("@", "_").replace(".", "_").replace("-", "_") or "candidate"
    candidate_username = base
    counter = 1
    while True:
        existing = await db.scalar(select(Candidate.id).where(Candidate.username == candidate_username).limit(1))
        if not existing:
            return candidate_username
        counter += 1
        candidate_username = f"{base}_{counter}"


def _build_invite_url(login_identifier: str, password: str, interview_token: str) -> str:
    return (
        f"{settings.frontend_origin}/candidate-login"
        f"?login={quote_plus(login_identifier)}"
        f"&password={quote_plus(password)}"
        f"&token={quote_plus(interview_token)}"
    )


def _normalize_invite_expiry(invite_expiry_hours: int | None) -> datetime | None:
    if invite_expiry_hours is None:
        return None
    if invite_expiry_hours not in ALLOWED_INVITE_EXPIRY_HOURS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invite expiry must be one of 12, 24, 48, 72 hours, or no limit.",
        )
    return datetime.now(timezone.utc) + timedelta(hours=invite_expiry_hours)


def _send_invite_email(
    *,
    candidate_name: str,
    candidate_email: str,
    hr_name: str,
    job: Job,
    password: str,
    invite_url: str,
    invite_expires_at: datetime | None,
) -> tuple[bool, str | None]:
    subject, body = build_interview_invitation_email(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        hr_name=hr_name,
        job_title=job.title,
        department_name=job.category,
        interview_link=invite_url,
        login_identifier=candidate_email,
        password=password,
        invite_expires_at=invite_expires_at,
        time_limit_per_question=job.time_limit_per_question,
        question_count=len(job.questions),
    )
    return send_email(to_email=candidate_email, subject=subject, body=body)


def _candidate_to_list_item(candidate: Candidate) -> CandidateListItem:
    latest_session = sorted(candidate.sessions, key=lambda item: item.id)[-1] if candidate.sessions else None
    score = latest_session.session_score if latest_session else None
    return CandidateListItem(
        id=candidate.id,
        hr_user_id=candidate.hr_user_id,
        job_id=candidate.job_id,
        name=candidate.name,
        email=candidate.email,
        username=candidate.email,
        status=candidate.status,
        applied_at=candidate.applied_at,
        current_role=candidate.current_role,
        years_experience=candidate.years_experience,
        job_category=candidate.job.category if candidate.job else None,
        latest_session_id=latest_session.id if latest_session else None,
        latest_session_duration_seconds=latest_session.duration_seconds if latest_session else None,
        top_integrity_flags=top_flag_descriptions(
            [
                {
                    "event_type": event.event_type.value,
                    "timestamp_seconds": event.timestamp_seconds,
                    "description": event.description,
                }
                for event in latest_session.integrity_events
            ]
            if latest_session
            else []
        ),
        session_score=SessionScoreSummary.model_validate(score) if score else None,
    )


def _candidate_to_detail(candidate: Candidate) -> CandidateDetail:
    latest_session = sorted(candidate.sessions, key=lambda item: item.id)[-1] if candidate.sessions else None
    typed_responses = []
    if latest_session and latest_session.raw_answers_path:
        try:
            payload = load_json(latest_session.raw_answers_path)
            if isinstance(payload, list):
                typed_responses = payload
        except FileNotFoundError:
            typed_responses = []
    return CandidateDetail(
        processing_error=(next((run.logs for run in sorted(latest_session.pipeline_runs, key=lambda run: run.id, reverse=True) if run.failed_task), None)
                          if latest_session and latest_session.processing_status == ProcessingStatus.failed else None),
        id=candidate.id,
        hr_user_id=candidate.hr_user_id,
        job_id=candidate.job_id,
        name=candidate.name,
        email=candidate.email,
        username=candidate.email,
        status=candidate.status,
        resume_url=_public_storage_path(candidate.resume_url),
        deadline_extension_requested_at=candidate.deadline_extension_requested_at,
        deadline_extension_reason=candidate.deadline_extension_reason,
        applied_at=candidate.applied_at,
        current_role=candidate.current_role,
        years_experience=candidate.years_experience,
        job_title=candidate.job.title,
        job_category=candidate.job.category,
        time_mode=candidate.job.time_mode.value,
        time_limit_per_question=candidate.job.time_limit_per_question,
        session_id=latest_session.id if latest_session else None,
        started_at=latest_session.started_at if latest_session else None,
        ended_at=latest_session.ended_at if latest_session else None,
        duration_seconds=latest_session.duration_seconds if latest_session else None,
        raw_video_path=latest_session.raw_video_path if latest_session else None,
        raw_screen_path=latest_session.raw_screen_path if latest_session else None,
        processing_status=latest_session.processing_status.value if latest_session else None,
        session_score=SessionScoreSummary.model_validate(latest_session.session_score)
        if latest_session and latest_session.session_score
        else None,
        integrity_events=[
            IntegrityEventRead.model_validate(item) for item in (latest_session.integrity_events if latest_session else [])
        ],
        question_responses=[
            QuestionResponseRead.model_validate(item)
            for item in (latest_session.question_responses if latest_session else [])
        ],
        typed_responses=typed_responses,
        hr_notes=[
            HRNoteRead.model_validate(item) for item in (latest_session.hr_notes if latest_session else [])
        ],
    )


@router.post("/questions/check-quality", response_model=JobQuestionQualityCheckResponse)
async def check_question_quality(payload: JobQuestionQualityCheckRequest) -> JobQuestionQualityCheckResponse:
    return JobQuestionQualityCheckResponse.model_validate(
        assess_question_quality(
            question_text=payload.question_text,
            response_type=payload.response_type.value,
            helper_text=payload.helper_text,
            evaluation_focus=payload.evaluation_focus,
            ideal_answer_traits=payload.ideal_answer_traits,
            red_flag_points=payload.red_flag_points,
        )
    )


async def _create_candidate_record(
    db: AsyncSession,
    hr_user_id: int,
    hr_name: str,
    job: Job,
    email: str,
    name: str | None = None,
    password: str | None = None,
    username: str | None = None,
    invite_expiry_hours: int | None = 24,
) -> CandidateInviteResponse:
    email = email.strip().lower()
    invite_expires_at = _normalize_invite_expiry(invite_expiry_hours)
    existing_same_job = await db.scalar(
        select(Candidate).where(
            Candidate.hr_user_id == hr_user_id,
            Candidate.job_id == job.id,
            Candidate.email == email,
        )
    )

    existing_account = (
        await db.execute(select(Candidate).where(Candidate.email == email).order_by(Candidate.applied_at.desc()))
    ).scalars().all()
    latest_account = existing_account[0] if existing_account else None
    login_password = password or (latest_account.password if latest_account else _generate_password())
    if password:
        for account in existing_account:
            account.password = password
    applied_at = datetime.now(timezone.utc)

    if existing_same_job:
        candidate = existing_same_job
        if candidate.status != CandidateStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{email} has already completed or moved forward in this job category.",
            )
        candidate.name = _derive_display_name(email, name or candidate.name)
        candidate.password = login_password
        candidate.interview_token = f"invite-{uuid4().hex[:12]}"
        candidate.invite_expires_at = invite_expires_at
        candidate.applied_at = applied_at
    else:
        internal_username = await _generate_unique_candidate_username(db, username or email.split("@")[0])
        candidate = Candidate(
            hr_user_id=hr_user_id,
            name=_derive_display_name(email, name or (latest_account.name if latest_account else None)),
            email=email,
            username=internal_username,
            password=login_password,
            job_id=job.id,
            resume_url=latest_account.resume_url if latest_account else None,
            applied_at=applied_at,
            interview_token=f"invite-{uuid4().hex[:12]}",
            invite_expires_at=invite_expires_at,
            current_role=latest_account.current_role if latest_account else None,
            years_experience=latest_account.years_experience if latest_account else None,
        )
        db.add(candidate)
    await db.flush()
    invite_url = _build_invite_url(candidate.email, candidate.password, candidate.interview_token)
    email_sent, email_error = await run_in_threadpool(_send_invite_email,
        candidate_name=candidate.name,
        candidate_email=candidate.email,
        hr_name=hr_name,
        job=job,
        password=candidate.password,
        invite_url=invite_url,
        invite_expires_at=invite_expires_at,
    )

    return CandidateInviteResponse(
        candidate_id=candidate.id,
        hr_user_id=candidate.hr_user_id,
        job_id=candidate.job_id,
        candidate_name=candidate.name,
        candidate_email=candidate.email,
        username=candidate.username,
        password=candidate.password,
        interview_token=candidate.interview_token,
        job_title=job.title,
        job_category=job.category,
        time_mode=job.time_mode.value,
        time_limit_per_question=job.time_limit_per_question,
        login_identifier=candidate.email,
        invite_url=invite_url,
        invite_expires_at=invite_expires_at,
        email_sent=email_sent,
        email_error=email_error,
        mailbox_preview_url=settings.mailbox_preview_url,
    )


@router.get("/jobs", response_model=list[JobListItem])
async def list_jobs(
    hr_user_id: int | None = Query(default=None),
    authenticated_hr_id: int = Depends(require_hr),
    db: AsyncSession = Depends(get_db_session),
) -> list[JobListItem]:
    query = (
        select(Job, func.count(Candidate.id))
        .outerjoin(Candidate, Candidate.job_id == Job.id)
        .group_by(Job.id)
        .order_by(Job.created_at.desc())
    )
    query = query.where(Job.hr_user_id == authenticated_hr_id)
    rows = (await db.execute(query)).all()
    return [
        JobListItem(
            id=job.id,
            hr_user_id=job.hr_user_id,
            title=job.title,
            category=job.category,
            description=job.description,
            time_mode=job.time_mode,
            time_limit_per_question=job.time_limit_per_question,
            created_at=job.created_at,
            candidate_count=candidate_count,
        )
        for job, candidate_count in rows
    ]


@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db_session)) -> JobRead:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found.")
    return JobRead.model_validate(job)


@router.post("/jobs", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db_session)) -> JobRead:
    hr_user = await db.get(HRUser, payload.hr_user_id)
    if not hr_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")
    if payload.time_mode.value == "fixed" and payload.time_limit_per_question is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fixed interviews need a time limit.")

    job = Job(
        hr_user_id=payload.hr_user_id,
        title=payload.title,
        category=payload.category,
        description=payload.description,
        questions=[question.model_dump() for question in payload.questions],
        time_mode=payload.time_mode,
        time_limit_per_question=payload.time_limit_per_question,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return JobRead.model_validate(job)


@router.put("/jobs/{job_id}", response_model=JobRead)
async def update_job(
    job_id: int,
    payload: JobUpdate,
    db: AsyncSession = Depends(get_db_session),
) -> JobRead:
    job = await db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found.")
    if await db.scalar(select(Candidate.id).where(Candidate.job_id == job_id).limit(1)):
        raise HTTPException(409, "This job already has invitations. Duplicate it to change the questions or settings without altering candidate history.")
    if payload.time_mode.value == "fixed" and payload.time_limit_per_question is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fixed interviews need a time limit.")

    job.title = payload.title
    job.category = payload.category
    job.description = payload.description
    job.questions = [question.model_dump() for question in payload.questions]
    job.time_mode = payload.time_mode
    job.time_limit_per_question = payload.time_limit_per_question
    await db.commit()
    await db.refresh(job)
    return JobRead.model_validate(job)


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db_session)) -> dict[str, object]:
    job = await db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found.")
    if await db.scalar(select(Candidate.id).where(Candidate.job_id == job_id).limit(1)):
        raise HTTPException(409, "This job has candidate records and cannot be deleted. Keep it for review or duplicate it for a new interview.")
    await db.delete(job)
    await db.commit()
    return {"job_id": job_id, "deleted": True}


@router.post("/jobs/{job_id}/duplicate", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def duplicate_job(job_id: int, db: AsyncSession = Depends(get_db_session)) -> JobRead:
    source_job = await db.get(Job, job_id)
    if not source_job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found.")

    duplicate = Job(
        hr_user_id=source_job.hr_user_id,
        title=f"{source_job.title} Copy",
        category=source_job.category,
        description=source_job.description,
        questions=source_job.questions,
        time_mode=source_job.time_mode,
        time_limit_per_question=source_job.time_limit_per_question,
    )
    db.add(duplicate)
    await db.commit()
    await db.refresh(duplicate)
    return JobRead.model_validate(duplicate)


@router.get("/jobs/{job_id}/candidates", response_model=list[CandidateListItem])
async def list_job_candidates(
    job_id: int,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> list[CandidateListItem]:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.job),
            selectinload(Candidate.sessions).selectinload(Session.session_score),
            selectinload(Candidate.sessions).selectinload(Session.integrity_events),
        )
        .where(Candidate.job_id == job_id)
        .order_by(Candidate.applied_at.desc())
    )
    if search:
        search_term = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Candidate.name).like(search_term),
                func.lower(Candidate.email).like(search_term),
                func.lower(Candidate.username).like(search_term),
                func.lower(func.coalesce(Candidate.current_role, "")).like(search_term),
            )
        )
    if status_filter:
        query = query.where(Candidate.status == status_filter)
    candidates = (await db.execute(query)).scalars().unique().all()
    return [_candidate_to_list_item(candidate) for candidate in candidates]


@router.get("/candidates/search", response_model=list[CandidateListItem])
async def search_candidates(
    hr_user_id: int,
    q: str = Query(default=""),
    status_filter: str | None = Query(default=None),
    job_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> list[CandidateListItem]:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.job),
            selectinload(Candidate.sessions).selectinload(Session.session_score),
            selectinload(Candidate.sessions).selectinload(Session.integrity_events),
        )
        .where(Candidate.hr_user_id == hr_user_id)
        .order_by(Candidate.applied_at.desc())
    )
    if job_id is not None:
        query = query.where(Candidate.job_id == job_id)
    if status_filter:
        query = query.where(Candidate.status == status_filter)
    if q.strip():
        search_term = f"%{q.lower()}%"
        query = query.where(
            or_(
                func.lower(Candidate.name).like(search_term),
                func.lower(Candidate.email).like(search_term),
                func.lower(Candidate.username).like(search_term),
                func.lower(func.coalesce(Candidate.current_role, "")).like(search_term),
                func.lower(func.coalesce(Candidate.resume_url, "")).like(search_term),
                func.lower(func.coalesce(Candidate.interview_token, "")).like(search_term),
            )
        )
    candidates = (await db.execute(query)).scalars().unique().all()
    return [_candidate_to_list_item(candidate) for candidate in candidates]


@router.post("/candidates/invite", response_model=CandidateInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate_invite(
    payload: CandidateInviteCreate,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateInviteResponse:
    hr_user = await db.get(HRUser, payload.hr_user_id)
    if not hr_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")

    job = await db.scalar(select(Job).where(Job.id == payload.job_id).with_for_update())
    if not job or job.hr_user_id != payload.hr_user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found for this HR user.")

    invite = await _create_candidate_record(
        db=db,
        hr_user_id=payload.hr_user_id,
        hr_name=hr_user.name,
        job=job,
        email=payload.email,
        name=payload.name,
        password=payload.password,
        username=payload.username,
        invite_expiry_hours=payload.invite_expiry_hours,
    )
    await db.commit()
    return invite


@router.post("/candidates/invite/bulk", response_model=list[CandidateInviteResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_candidate_invites(
    payload: BulkCandidateInviteCreate,
    db: AsyncSession = Depends(get_db_session),
) -> list[CandidateInviteResponse]:
    hr_user = await db.get(HRUser, payload.hr_user_id)
    if not hr_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")

    job = await db.scalar(select(Job).where(Job.id == payload.job_id).with_for_update())
    if not job or job.hr_user_id != payload.hr_user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job category not found for this HR user.")

    emails = [str(candidate.email).strip().lower() for candidate in payload.candidates]
    if len(emails) != len(set(emails)):
        raise HTTPException(422, "Bulk invites contain duplicate email addresses. Remove duplicates and retry.")
    existing = await db.scalar(select(Candidate.id).where(
        Candidate.job_id == job.id, Candidate.email.in_(emails), Candidate.status != CandidateStatus.pending,
    ).limit(1))
    if existing:
        raise HTTPException(409, "A candidate in this list has already submitted this interview. No invitations were sent.")
    invites: list[CandidateInviteResponse] = []
    for candidate_payload in payload.candidates:
        invite = await _create_candidate_record(
            db=db,
            hr_user_id=payload.hr_user_id,
            hr_name=hr_user.name,
            job=job,
            email=candidate_payload.email,
            name=candidate_payload.name,
            invite_expiry_hours=payload.invite_expiry_hours,
        )
        invites.append(invite)
    await db.commit()
    return invites


@router.get("/jobs/{job_id}/analytics", response_model=JobAnalyticsResponse)
async def get_job_analytics(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> JobAnalyticsResponse:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.sessions).selectinload(Session.session_score),
            selectinload(Candidate.sessions).selectinload(Session.integrity_events),
        )
        .where(Candidate.job_id == job_id)
    )
    candidates = (await db.execute(query)).scalars().unique().all()
    return build_job_analytics(candidates)


@router.get("/candidates/{candidate_id}", response_model=CandidateDetail)
async def get_candidate_detail(
    candidate_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateDetail:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.job),
            selectinload(Candidate.sessions).selectinload(Session.session_score),
            selectinload(Candidate.sessions).selectinload(Session.integrity_events),
            selectinload(Candidate.sessions).selectinload(Session.question_responses),
            selectinload(Candidate.sessions).selectinload(Session.hr_notes),
            selectinload(Candidate.sessions).selectinload(Session.pipeline_runs),
        )
        .where(Candidate.id == candidate_id)
    )
    candidate = (await db.execute(query)).scalar_one_or_none()
    if not candidate or not candidate.job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
    return _candidate_to_detail(candidate)


@router.post("/candidates/{candidate_id}/retry-processing")
async def retry_processing(candidate_id: int, db: AsyncSession = Depends(get_db_session)):
    session = await db.scalar(select(Session).where(Session.candidate_id == candidate_id).order_by(Session.id.desc()).limit(1).with_for_update())
    if not session or session.processing_status != ProcessingStatus.failed:
        raise HTTPException(409, "Only failed recordings can be reprocessed.")
    session.processing_status = ProcessingStatus.pending
    await db.commit()
    try:
        await enqueue_session(session.id)
    except Exception:
        pass  # The worker also polls pending rows to recover queue outages.
    return {"session_id": session.id, "processing_status": session.processing_status}


@router.patch("/candidates/{candidate_id}/status", response_model=CandidateStatusResponse)
async def update_candidate_status(
    candidate_id: int,
    payload: CandidateStatusUpdate,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateStatusResponse:
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
    candidate.status = payload.status
    await db.commit()
    return CandidateStatusResponse(candidate_id=candidate.id, status=candidate.status)


@router.patch(
    "/candidates/{candidate_id}/extend-deadline",
    response_model=CandidateDeadlineExtensionUpdateResponse,
)
async def extend_candidate_deadline(
    candidate_id: int,
    payload: CandidateDeadlineExtensionUpdate,
    db: AsyncSession = Depends(get_db_session),
) -> CandidateDeadlineExtensionUpdateResponse:
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
    if candidate.status != CandidateStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending interviews can receive a new deadline.",
        )

    candidate.invite_expires_at = _normalize_invite_expiry(payload.invite_expiry_hours)
    candidate.deadline_extension_requested_at = None
    candidate.deadline_extension_reason = None
    await db.commit()

    return CandidateDeadlineExtensionUpdateResponse(
        candidate_id=candidate.id,
        invite_expires_at=candidate.invite_expires_at,
    )


@router.post("/candidates/{candidate_id}/notes", response_model=HRNoteCreateResponse)
async def add_candidate_note(
    candidate_id: int,
    payload: HRNoteCreate,
    db: AsyncSession = Depends(get_db_session),
) -> HRNoteCreateResponse:
    query = (
        select(Candidate)
        .options(selectinload(Candidate.sessions))
        .where(Candidate.id == candidate_id)
    )
    candidate = (await db.execute(query)).scalar_one_or_none()
    if not candidate or not candidate.sessions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate session not found.")

    latest_session = sorted(candidate.sessions, key=lambda item: item.id)[-1]
    note = HRNote(
        session_id=latest_session.id,
        hr_user=payload.hr_user,
        note=payload.note,
        created_at=datetime.now(timezone.utc),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return HRNoteCreateResponse(note=HRNoteRead.model_validate(note))
