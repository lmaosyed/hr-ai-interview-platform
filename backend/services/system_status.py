"""Readiness checks exposed only to the platform administrator."""

import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from backend.core.config import get_settings
from backend.core.database import SessionLocal
from backend.services.queue import build_redis_client

WORKER_HEARTBEAT_KEY = "interview_worker_heartbeat"


async def read_system_status(verify_ai: bool = False) -> dict:
    settings = get_settings()
    database_ok = False
    queue_ok = False
    worker_ok = False
    try:
        async with SessionLocal() as db:
            database_ok = await db.scalar(text("SELECT 1")) == 1
    except Exception:
        pass
    redis = build_redis_client()
    try:
        queue_ok = bool(await redis.ping())
        heartbeat = await redis.get(WORKER_HEARTBEAT_KEY)
        worker_ok = bool(heartbeat and time.time() - float(heartbeat) < 45)
    except Exception:
        pass
    finally:
        await redis.aclose()

    ai_state = "unchecked"
    ai_message = "Check the AI connection before inviting candidates."
    has_key = bool(settings.gemini_api_key and not settings.gemini_api_key.startswith("your_"))
    if settings.demo_mode:
        ai_state, ai_message = "blocked", "Disable DEMO_MODE and configure a real AI provider before interviewing."
    elif not has_key:
        ai_state, ai_message = "blocked", "Add your Gemini API key to GEMINI_API_KEY in the local .env file."
    elif settings.llm_provider not in {"gemini", "auto"}:
        ai_state, ai_message = "unchecked", "This setup check supports Gemini. Check the configured provider separately."
    elif verify_ai:
        try:
            # Model metadata validates access without generating paid model output.
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}",
                    headers={"x-goog-api-key": settings.gemini_api_key},
                )
            if response.status_code == 200:
                ai_state, ai_message = "ready", "Gemini accepted the key and model. Live evaluation still depends on available quota."
            elif response.status_code in {400, 401, 403}:
                ai_state, ai_message = "blocked", "Google rejected the Gemini key or model access. Replace the key in your local .env, recreate the API and worker, then check again."
            elif response.status_code == 404:
                ai_state, ai_message = "blocked", "The configured Gemini model was not found. Update GEMINI_MODEL."
            elif response.status_code == 429:
                ai_state, ai_message = "blocked", "Gemini is rate limited or has no quota available. Retry later."
            else:
                ai_state, ai_message = "blocked", "Gemini is unavailable. Check your account and try again."
        except httpx.HTTPError:
            ai_state, ai_message = "blocked", "Could not reach Gemini. Check your internet connection and retry."

    local_email = settings.smtp_host in {"mailpit", "localhost", "127.0.0.1"}
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "database_ready": database_ok,
        "queue_ready": queue_ok,
        "worker_ready": worker_ok,
        "ai_state": ai_state,
        "ai_message": ai_message,
        "ai_model": settings.gemini_model,
        "email_mode": "local" if local_email else "external" if settings.smtp_host else "unconfigured",
        "email_message": "Invites are captured in the local inbox. Configure SMTP to deliver to real email addresses."
                         if local_email else "SMTP is configured; confirm delivery using your own candidate invitation."
                         if settings.smtp_host else "Configure SMTP to send candidate invitations.",
        "local_inbox_url": settings.mailbox_preview_url if local_email else None,
    }
