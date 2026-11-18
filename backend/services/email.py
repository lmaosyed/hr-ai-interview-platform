from datetime import datetime, timezone
from email.message import EmailMessage
import smtplib

from backend.core.config import get_settings


settings = get_settings()


def _format_expiry(invite_expires_at: datetime | None) -> str:
    if not invite_expires_at:
        return "This invitation does not expire."

    local_expiry = invite_expires_at.astimezone(timezone.utc)
    return (
        "Please complete the interview before "
        f"{local_expiry.strftime('%d %b %Y, %I:%M %p UTC')}."
    )


def _estimate_duration_minutes(time_limit_per_question: int | None, question_count: int) -> int | None:
    if not time_limit_per_question or question_count <= 0:
        return None
    return max(1, round((time_limit_per_question * question_count) / 60))


def build_interview_invitation_email(
    *,
    candidate_name: str,
    candidate_email: str,
    hr_name: str,
    job_title: str,
    department_name: str,
    interview_link: str,
    login_identifier: str,
    password: str,
    invite_expires_at: datetime | None,
    time_limit_per_question: int | None,
    question_count: int,
) -> tuple[str, str]:
    company_name = settings.company_name
    subject = (
        f"Invitation to interview – {company_name} / Interview for the {job_title} position"
    )
    estimated_minutes = _estimate_duration_minutes(time_limit_per_question, question_count)
    duration_copy = (
        f"The interview will last about {estimated_minutes} minutes and "
        if estimated_minutes
        else "The interview can be completed at your convenience, and "
    )
    expiry_copy = _format_expiry(invite_expires_at)
    body = f"""Hi {candidate_name},

Thank you for applying to {company_name}.

Your application for the {job_title} position stood out to us and we would like to invite you for an interview with our {department_name} team to get to know you a bit better.

You will be meeting with our async interview platform on behalf of {hr_name}. {duration_copy}you will have the chance to discuss the {job_title} position and learn more about our company. Please keep your camera, microphone, and entire-screen sharing enabled during the interview.

Interview link: {interview_link}
Login email: {login_identifier}
Temporary password: {password}

{expiry_copy}

Looking forward to hearing from you,

All the best / Kind regards,

{hr_name}
{company_name}
"""
    return subject, body


def send_email(*, to_email: str, subject: str, body: str) -> tuple[bool, str | None]:
    if not settings.smtp_host:
        return False, "SMTP is not configured for this environment."

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:  # pragma: no cover - exercised in local env
        return False, str(exc)
    return True, None
