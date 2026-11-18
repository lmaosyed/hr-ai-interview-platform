from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from backend.core.config import get_settings
from backend.core.database import engine, get_db_session
from backend.core.security import current_identity
from backend.models import Candidate, Session
from backend.models import Base
from backend.routers.admin import router as admin_router
from backend.routers.auth import router as auth_router
from backend.routers.hr import router as hr_router
from backend.routers.interview import router as interview_router
from backend.routers.lab import router as lab_router
from backend.services.storage import ensure_storage_dirs


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_storage_dirs()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("ALTER TABLE integrity_events ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0"))
        await connection.execute(
            text(
                "ALTER TABLE candidates "
                "ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE candidates "
                "ADD COLUMN IF NOT EXISTS deadline_extension_requested_at TIMESTAMPTZ"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE candidates "
                "ADD COLUMN IF NOT EXISTS deadline_extension_reason TEXT"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS response_type VARCHAR(32)"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS helper_text TEXT"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS communication_score DOUBLE PRECISION"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS transcript_start_seconds DOUBLE PRECISION"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS transcript_end_seconds DOUBLE PRECISION"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS score_rationale JSONB"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS highlight_moments JSONB"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE question_responses "
                "ADD COLUMN IF NOT EXISTS transcript_timestamps JSONB"
            )
        )
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(interview_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(hr_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)
app.include_router(lab_router, prefix=settings.api_prefix)
@app.get("/storage/{file_path:path}")
async def stored_file(file_path: str, identity: dict = Depends(current_identity), db: AsyncSession = Depends(get_db_session)):
    root = Path("storage").resolve()
    target = (root / file_path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(404, "File not found.")
    relative = f"storage/{file_path}"
    query = select(Candidate).outerjoin(Session).where(or_(
        Candidate.resume_url.in_([relative, f"/{relative}"]),
        Session.raw_video_path == relative, Session.raw_screen_path == relative,
        Session.raw_audio_path == relative,
    ))
    if identity["role"] == "hr":
        query = query.where(Candidate.hr_user_id == int(identity["sub"]))
    elif identity["role"] == "candidate":
        query = query.where(Candidate.email == identity["sub"])
    if identity["role"] != "admin" and not (await db.execute(query)).scalars().first():
        raise HTTPException(404, "File not found in your account.")
    return FileResponse(target, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
