from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.database import get_db_session
from backend.core.enums import CandidateStatus
from backend.core.security import require_admin, hash_password
from backend.models.candidate import Candidate
from backend.models.hr_user import HRUser
from backend.schemas.admin import (
    AdminCandidateSummary,
    AdminDashboardResponse,
    AdminHRUserRead,
    AdminMetrics,
    HRUserCreate,
    HRUserStatusUpdate,
    SystemStatus,
)
from backend.services.system_status import read_system_status


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/system-status", response_model=SystemStatus)
async def system_status(verify_ai: bool = False):
    return await read_system_status(verify_ai)


def _serialize_hr_user(hr_user: HRUser) -> AdminHRUserRead:
    return AdminHRUserRead(
        id=hr_user.id,
        name=hr_user.name,
        email=hr_user.email,
        username=hr_user.username,
        is_active=hr_user.is_active,
        created_at=hr_user.created_at,
        job_count=len(hr_user.jobs),
        candidate_count=len(hr_user.candidates),
        candidates=[
            AdminCandidateSummary(
                id=candidate.id,
                name=candidate.name,
                username=candidate.username,
                email=candidate.email,
                status=candidate.status.value,
                job_title=candidate.job.title if candidate.job else "Unknown",
                job_category=candidate.job.category if candidate.job else "Unknown",
                applied_at=candidate.applied_at,
            )
            for candidate in sorted(hr_user.candidates, key=lambda item: item.applied_at, reverse=True)
        ],
    )


async def _load_hr_users(db: AsyncSession) -> list[HRUser]:
    query = (
        select(HRUser)
        .options(
            selectinload(HRUser.jobs),
            selectinload(HRUser.candidates).selectinload(Candidate.job),
        )
        .order_by(HRUser.created_at.desc())
    )
    return list((await db.execute(query)).scalars().unique().all())


@router.post("/hr-users", response_model=AdminHRUserRead, status_code=status.HTTP_201_CREATED)
async def create_hr_user(
    payload: HRUserCreate,
    db: AsyncSession = Depends(get_db_session),
) -> AdminHRUserRead:
    duplicate_query = select(HRUser).where((HRUser.username == payload.username) | (HRUser.email == payload.email))
    duplicate = (await db.execute(duplicate_query)).scalars().first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="HR username or email already exists.")

    hr_user = HRUser(
        name=payload.name,
        email=payload.email,
        username=payload.username,
        password=hash_password(payload.password),
        is_active=True,
    )
    db.add(hr_user)
    await db.commit()
    return _serialize_hr_user(next(user for user in await _load_hr_users(db) if user.id == hr_user.id))


@router.patch("/hr-users/{hr_user_id}/status", response_model=AdminHRUserRead)
async def update_hr_user_status(
    hr_user_id: int,
    payload: HRUserStatusUpdate,
    db: AsyncSession = Depends(get_db_session),
) -> AdminHRUserRead:
    query = (
        select(HRUser)
        .options(
            selectinload(HRUser.jobs),
            selectinload(HRUser.candidates).selectinload(Candidate.job),
        )
        .where(HRUser.id == hr_user_id)
    )
    hr_user = (await db.execute(query)).scalar_one_or_none()
    if not hr_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")
    hr_user.is_active = payload.is_active
    await db.commit()
    return _serialize_hr_user(hr_user)


@router.delete("/hr-users/{hr_user_id}")
async def delete_hr_user(
    hr_user_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    hr_user = await db.get(HRUser, hr_user_id)
    if not hr_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")
    await db.delete(hr_user)
    await db.commit()
    return {"hr_user_id": hr_user_id, "deleted": True}


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def admin_dashboard(db: AsyncSession = Depends(get_db_session)) -> AdminDashboardResponse:
    hr_users = await _load_hr_users(db)
    all_candidates = [candidate for hr_user in hr_users for candidate in hr_user.candidates]
    metrics = AdminMetrics(
        total_hrs=len(hr_users),
        active_hrs=sum(1 for hr_user in hr_users if hr_user.is_active),
        suspended_hrs=sum(1 for hr_user in hr_users if not hr_user.is_active),
        total_candidates=len(all_candidates),
        total_templates=sum(len(hr_user.jobs) for hr_user in hr_users),
        pending_decisions=sum(
            1
            for candidate in all_candidates
            if candidate.status in {CandidateStatus.pending, CandidateStatus.completed, CandidateStatus.reviewed}
        ),
    )
    return AdminDashboardResponse(
        metrics=metrics,
        hr_users=[_serialize_hr_user(hr_user) for hr_user in hr_users],
    )
