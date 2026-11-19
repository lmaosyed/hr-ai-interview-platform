# Security and Privacy Boundaries

This repository is a **localhost portfolio MVP**. It is not ready for public candidate data or production hiring. The default Compose ports bind to `127.0.0.1` intentionally.

## Included Safeguards

- Server-signed expiring sessions, active-account checks and recruiter ownership checks.
- Hashed admin/HR passwords, upload/telemetry validation and duplicate-submission guards.
- Ownership-checked media/resume access and raw/processed storage outside Git.
- Local Mailpit email capture and explicit AI/provider failures instead of fabricated results.
- The launcher creates a local session secret; `.env`, keys, recordings, resumes and generated reports are ignored.

## Before Any Public Deployment

The candidate model still stores reusable invitation credentials in application rows and includes them in invitation URLs/messages. Applications sharing an email share credentials; this must be replaced with an independent hashed candidate identity, one-time invitations, password setup/reset, and strict cross-organization isolation. **Do not use real personal data with this credential model.**

Session tokens in media URLs and localStorage are also prototype trade-offs. Production needs secure HttpOnly cookies or short-lived asset grants, session revocation, rate limits, a CSP, HTTPS, CSRF assessment, audit logging, and hardened account recovery. The open practice endpoint requires authentication/quotas before public use to prevent storage/provider abuse.

Add database migrations, secret rotation, encrypted storage/backups, retention/deletion controls, size-limited resumable uploads, malware scanning, least-privileged containers, and deployment monitoring. Never run submitted code without a separately secured execution sandbox. Do not expose Docker development servers directly to the internet.

Proctoring flags are fallible observations, not findings of misconduct. Hiring use would need accessibility/accommodation design, consent/retention policies, applicable legal review, measured fairness/reliability, and human oversight. These are not claimed as completed.

If a secret was committed or pasted into a public place, revoke/rotate it with its provider. Removing a local file does not revoke a leaked key. To report an issue, contact the repository owner without posting credentials or candidate recordings in a public issue.
