"""Signed, expiring sessions and ownership checks for the local application."""

import base64
import hashlib
import hmac
import json
import secrets
import time

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.database import get_db_session
from backend.models import AdminUser, Candidate, HRUser, Job


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if not stored.startswith("scrypt$"):
        return hmac.compare_digest(password, stored)
    _, salt, expected = stored.split("$")
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)


def issue_token(role: str, subject: str | int) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({
        "role": role, "sub": str(subject), "exp": int(time.time()) + 28800,
    }).encode()).decode().rstrip("=")
    signature = hmac.new(get_settings().session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def decode_token(token: str) -> dict:
    try:
        payload, signature = token.split(".")
        expected = hmac.new(get_settings().session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if claims["exp"] <= time.time():
            raise ValueError("expired")
        return claims
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Your session has expired. Sign in again.") from None


async def current_identity(request: Request, db: AsyncSession = Depends(get_db_session)) -> dict:
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    # Media elements and resume links cannot attach Authorization headers.
    if request.url.path.startswith("/storage/"):
        token = token or request.query_params.get("access_token", "")
    claims = decode_token(token)
    model = {"hr": HRUser, "admin": AdminUser}.get(claims["role"])
    if model:
        account = await db.get(model, int(claims["sub"]))
        if not account or not account.is_active:
            raise HTTPException(401, "This account is no longer active.")
    elif claims["role"] != "candidate":
        raise HTTPException(401, "Invalid session.")
    return claims


async def require_admin(identity: dict = Depends(current_identity)) -> dict:
    if identity["role"] != "admin":
        raise HTTPException(403, "Administrator access is required.")
    return identity


async def require_hr(
    request: Request, identity: dict = Depends(current_identity),
    db: AsyncSession = Depends(get_db_session),
) -> int:
    if identity["role"] != "hr":
        raise HTTPException(403, "HR access is required.")
    hr_id = int(identity["sub"])
    requested_hr = request.query_params.get("hr_user_id")
    if request.method in {"POST", "PUT", "PATCH"} and await request.body():
        try:
            body = await request.json()
            requested_hr = body.get("hr_user_id", requested_hr)
        except (ValueError, AttributeError):
            raise HTTPException(422, "Expected a JSON object.") from None
    try:
        requested_hr = int(requested_hr) if requested_hr is not None else hr_id
    except ValueError:
        raise HTTPException(422, "Invalid HR identifier.") from None
    if requested_hr != hr_id:
        raise HTTPException(403, "You can only access your own HR workspace.")
    for param, model in (("job_id", Job), ("candidate_id", Candidate)):
        resource_id = request.path_params.get(param) or request.query_params.get(param)
        if resource_id is not None:
            try:
                resource_id = int(resource_id)
            except ValueError:
                raise HTTPException(422, "Invalid record identifier.") from None
            owner = await db.scalar(select(model.hr_user_id).where(model.id == resource_id))
            if owner != hr_id:
                raise HTTPException(404, "Record not found in your workspace.")
    return hr_id
