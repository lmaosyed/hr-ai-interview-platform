import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.database import get_db_session
from backend.core.enums import CandidateStatus, ProcessingStatus
from backend.core.security import current_identity
from backend.schemas.capture import CaptureEvent, GazeSample, parse_capture_json, parse_answer_windows, validate_capture_times
from backend.models.candidate import Candidate
from backend.models.session import Session
from backend.schemas.job import JobQuestion
from backend.schemas.session import (
    InterviewAccessRequest,
    InterviewContextResponse,
    SessionStatusResponse,
    SessionUploadResponse,
)
from backend.services.queue import enqueue_session
from backend.services.storage import ensure_storage_dirs, save_json, save_upload_file


router = APIRouter(tags=["interview"])


async def _load_candidate_by_token(
    db: AsyncSession,
    token: str,
    username: str | None = None,
) -> Candidate | None:
    query = (
        select(Candidate)
        .options(
            selectinload(Candidate.job),
            selectinload(Candidate.hr_user),
        )
        .where(Candidate.interview_token == token)
    )
    if username:
        query = query.where(or_(Candidate.username == username, Candidate.email == username))
    return (await db.execute(query)).scalar_one_or_none()


@router.post("/interview/access", response_model=InterviewContextResponse)
async def access_interview(
    payload: InterviewAccessRequest,
    identity: dict = Depends(current_identity),
    db: AsyncSession = Depends(get_db_session),
) -> InterviewContextResponse:
    candidate = await _load_candidate_by_token(db, payload.token, payload.username)
    if not candidate or not candidate.job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid interview token.")
    if identity["role"] != "candidate" or identity["sub"] != candidate.email:
        raise HTTPException(403, "Sign in with the candidate account invited to this interview.")
    if not candidate.hr_user or not candidate.hr_user.is_active:
        raise HTTPException(403, "This interview's HR account is inactive.")
    if not (candidate.current_role and candidate.resume_url and candidate.years_experience is not None):
        raise HTTPException(422, "Complete your profile and upload a resume before starting.")
    if candidate.status != CandidateStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview has already been submitted or reviewed and cannot be taken again.",
        )
    if candidate.invite_expires_at and datetime.now(timezone.utc) > candidate.invite_expires_at:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This interview link has expired. Contact the HR team to request a fresh invite.",
        )

    return InterviewContextResponse(
        candidate_id=candidate.id,
        candidate_name=candidate.name,
        candidate_username=candidate.email,
        hr_name=candidate.hr_user.name if candidate.hr_user else "HR team",
        job_id=candidate.job.id,
        job_title=candidate.job.title,
        job_category=candidate.job.category,
        job_description=candidate.job.description,
        questions=[JobQuestion.model_validate(question) for question in candidate.job.questions],
        time_mode=candidate.job.time_mode,
        time_limit_per_question=candidate.job.time_limit_per_question,
        invite_expires_at=candidate.invite_expires_at,
    )


@router.get("/interview/{token}", response_model=InterviewContextResponse)
async def get_interview_context(
    token: str,
    username: str | None = None,
    identity: dict = Depends(current_identity),
    db: AsyncSession = Depends(get_db_session),
) -> InterviewContextResponse:
    return await access_interview(
        payload=InterviewAccessRequest(username=username, token=token),
        identity=identity,
        db=db,
    )


@router.post("/sessions/upload", response_model=SessionUploadResponse)
async def upload_session(
    candidate_id: int = Form(...),
    interview_token: str = Form(...),
    started_at: datetime = Form(...),
    ended_at: datetime = Form(...),
    duration_seconds: int = Form(...),
    gaze_data: str = Form(...),
    integrity_events: str = Form(...),
    typed_answers: str = Form(default="[]"),
    answer_windows: str = Form(default="[]"),
    video: UploadFile = File(...),
    screen: UploadFile = File(...),
    audio: UploadFile = File(...),
    identity: dict = Depends(current_identity),
    db: AsyncSession = Depends(get_db_session),
) -> SessionUploadResponse:
    validate_capture_times(started_at, ended_at, duration_seconds)
    gaze = parse_capture_json(gaze_data, "gaze data", GazeSample)
    events = parse_capture_json(integrity_events, "integrity events", CaptureEvent)
    answers = parse_capture_json(typed_answers, "typed answers")
    windows = parse_answer_windows(answer_windows, duration_seconds)
    candidate = await db.scalar(select(Candidate).where(Candidate.id == candidate_id).with_for_update())
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
    if identity["role"] != "candidate" or identity["sub"] != candidate.email or candidate.interview_token != interview_token:
        raise HTTPException(403, "These recording credentials do not match the candidate.")
    if candidate.status != CandidateStatus.pending:
        raise HTTPException(409, "This interview has already been submitted and cannot be retaken.")
    if candidate.invite_expires_at and started_at > candidate.invite_expires_at:
        raise HTTPException(410, "This interview invitation has expired.")
    if not (candidate.current_role and candidate.resume_url and candidate.years_experience is not None):
        raise HTTPException(422, "Complete your candidate profile before submitting.")
    if any(file.size == 0 for file in (video, screen, audio)):
        raise HTTPException(422, "Camera, screen, and microphone recordings must not be empty.")

    ensure_storage_dirs()
    session = Session(
        candidate_id=candidate_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=duration_seconds,
        processing_status=ProcessingStatus.pending,
    )
    db.add(session)
    await db.flush()

    raw_dir = Path("storage") / "raw" / str(session.id)
    session.raw_video_path = await save_upload_file(video, raw_dir / "webcam.webm")
    session.raw_screen_path = await save_upload_file(screen, raw_dir / "screen.webm")
    session.raw_audio_path = await save_upload_file(audio, raw_dir / "audio.webm")
    session.raw_gaze_path = await save_json(gaze, raw_dir / "gaze.json")
    session.raw_integrity_path = await save_json(
        events,
        raw_dir / "integrity_events.json",
    )
    session.raw_answers_path = await save_json(answers, raw_dir / "typed_answers.json")
    await save_json(windows, raw_dir / "answer_windows.json")

    if candidate.status == CandidateStatus.pending:
        candidate.status = CandidateStatus.completed

    await db.commit()
    await db.refresh(session)
    try:
        await enqueue_session(session.id)
    except Exception:
        # The database-backed worker recovery finds pending sessions after a queue outage.
        import logging
        logging.exception("Session %s saved; queue unavailable", session.id)

    return SessionUploadResponse(
        session_id=session.id,
        processing_status=session.processing_status,
    )


@router.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: int,
    identity: dict = Depends(current_identity),
    db: AsyncSession = Depends(get_db_session),
) -> SessionStatusResponse:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if identity["role"] == "candidate" and identity["sub"] != candidate.email:
        raise HTTPException(403, "Session belongs to another candidate.")
    if identity["role"] == "hr" and int(identity["sub"]) != candidate.hr_user_id:
        raise HTTPException(403, "Session belongs to another HR workspace.")
    return SessionStatusResponse(session_id=session.id, processing_status=session.processing_status)
