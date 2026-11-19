# Changelog

## Unreleased - Reviewer Readiness (2026-11-19)

- Added a fresh-checkout launcher, local service health checks, reviewer guide, architecture/scoring documentation, security boundaries, screenshots, and public-repository reference notes.
- Simplified the dark landing page, HR navigation, pipeline table, job editor, and tabbed candidate report. Consolidated duplicate review screens and isolated practice at `/hrai/practisesession`.
- Fixed same-origin API/asset routing, unscored display, stale candidate-detail updates, worker restart recovery, and pipeline retry counts.
- Protected invited jobs from destructive edits/deletion; unused jobs remain editable, and duplication creates a new question set.
- Added build/compile/Compose checks in GitHub Actions, not an automated test suite. The original `v1.0.0` tag remains unchanged.

## 1.0.0 - 2026-11-18

Initial local MVP of Interview Review Studio.

- Administrator account provisioning, HR directories, suspension, and setup diagnostics.
- HR job/question templates with spoken, text, and code response types, timers, rubrics, and quality checks.
- Single/bulk candidate invitations, configurable expiry, and deadline extensions.
- Candidate profile/resume management, multiple invited roles, and completed-interview tracking.
- Shared camera, microphone, and entire-screen recording for interviews and the practice lab.
- Preparation time, exact answer windows, fullscreen checks, and duration-aware proctoring events.
- Redis-backed processing with raw/processed storage, ffmpeg audio extraction, and an optional Airflow workflow.
- Transcript/rubric evaluation, delivery metrics, separate integrity signals, and explanatory reports.
- HR recording playback, transcript search, timeline seeking, notes, decisions, and job analytics.
- Docker Compose setup, administrator bootstrap, and restart instructions.

### Release Notes

- Supply a valid Gemini key locally before using live transcription and answer scoring. No key is included.
- Mailpit captures local emails; configure SMTP for real inbox delivery.
- Camera attention and delivery measures require calibration on actual recordings; HR retains decision authority.
- Sentence highlight positions are approximate. Code answers receive rubric review without sandboxed execution.
- Automated test cases and generated checking artifacts were removed as requested.
- See README.md and START_HERE.md for setup and current development-tool limitations.
