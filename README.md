# Interview Review Studio

Version **1.0.0**: the initial local MVP. Live evaluation requires your own valid AI credentials and available quota. Recording data, resumes, credentials, and generated artifacts are excluded from this repository.

Async interview platform with candidate recording, HR review, admin provisioning, and an isolated evaluation lab.

Returning to the project? Start with [START_HERE.md](START_HERE.md). The admin dashboard also shows current database, worker, AI, and email setup status.

## Run locally

Install Docker Desktop and start it. Create `.env` from `.env.example` if one does not exist, then run:

```sh
docker compose up -d --build
```

- App: http://localhost:55173
- Practice lab: http://localhost:55173/evaluation-lab
- API docs: http://localhost:58000/docs
- Local email inbox: http://localhost:58025
- Admin login: http://localhost:55173/admin/login

An empty database bootstraps only the administrator (`admin / admin` by default). Set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` before first startup to use different credentials. No sample jobs, applicants, or scores are created. Existing accounts and interview records are preserved. Create HR accounts in the admin dashboard and generate candidate credentials from the HR invitation page.

Candidate login lives in memory and ends on page refresh. HR/admin sessions expire after eight hours and are checked by the backend. Without an explicitly configured `SESSION_SECRET`, restarting the API also ends existing sessions.

## AI configuration

Set these values in your local `.env` for real evaluation:

```dotenv
DEMO_MODE=false
LLM_PROVIDER=gemini
TRANSCRIPTION_PROVIDER=gemini
GEMINI_API_KEY=replace_with_your_own_key
GEMINI_MODEL=gemini-2.5-flash
SMTP_HOST=mailpit
SMTP_PORT=1025
```

Keep keys out of chat and source control. After changing `.env`, recreate both consumers:

```sh
docker compose up -d --force-recreate fastapi worker
```

Gemini requires a valid key, access to the selected model, and available quota. The stored key was rejected by Google during the November 18, 2026 setup check. Transcription errors remain visible instead of producing a canned transcript. OpenAI and Anthropic remain optional provider alternatives. Local storage, recording, queueing, and email capture do not require paid services.

Demonstration scoring is disabled: `DEMO_MODE=true` now blocks evaluation instead of producing heuristic answer scores. Real recording transcription fails clearly if no usable provider is configured. Mailpit captures messages locally; delivering invites to actual inboxes requires SMTP credentials. Localhost invite links only work on the same machine.

## Architecture and data engineering

```text
Candidate / Practice Lab
  -> shared browser recorder (camera, microphone, entire screen)
  -> FastAPI validation and immutable raw artifacts
  -> PostgreSQL session + Redis queue
  -> default Python worker (optional Airflow alternative)
  -> ffmpeg -> answer-window transcription -> rubric evaluation
  -> processed JSON artifacts + PostgreSQL scores
  -> HR transcript review, recording playback, timeline, analytics
```

`storage/raw/{session_id}` holds original recordings, answer windows, typed answers, and proctoring evidence. `storage/processed/{session_id}` holds extracted audio, transcripts, question segments, metrics, summaries, and reports. The lab uses separate `raw/lab` and `processed/lab` directories and does not change hiring records.

This is an ETL workflow: ingestion writes raw data; transformation extracts audio and question-level content; loading writes scored facts and review summaries. PostgreSQL keeps normalized job, applicant, session, response, event, and pipeline-run entities. Job/category and question metadata support cohort analytics. Redis decouples ingestion from processing. Pipeline runs record execution status and the failed task; failed analyses can be retried using the saved recording from HR review.

The default worker processes uploads without requiring Airflow. It also recovers pending database rows if queueing fails. Before enabling Airflow, set `AIRFLOW__CORE__FERNET_KEY` in your local `.env` to a newly generated Fernet key; the public example intentionally contains no encryption key. To demonstrate Airflow orchestration instead, stop the default worker first:

```sh
docker compose stop worker
docker compose --profile airflow up -d --build
```

Avoid running two orchestration systems against the same queue during a demo.

## Evaluation behavior

Both interview modes use `useSessionCapture`. Each question has 30 seconds of thinking time, an optional early-answer action, and an exact recorded answer window. Spoken answers are cut from those windows before transcription. Typed/code responses use their submitted text. Empty answers receive zero content and delivery credit. Code answers receive rubric review; an isolated code execution/test runner is not implemented.

Answer quality combines relevance (40%), depth (40%), and communication (20%) and uses difficulty/question weights. The session score combines answer quality (55%), observable delivery (25%), and communication (20%). Integrity does not enter that arithmetic or change the content recommendation band. HR makes the hiring decision.

Delivery uses transcript evidence, pace, whole-word filler counts, and measured audio gaps. Silence measurements use an ffmpeg amplitude threshold and can be affected by background noise. Thinking time is excluded when answer windows are present. Delivery measures are experimental and are not a validated psychological confidence assessment.

Proctoring allows brief tab/fullscreen slips under 1.5 seconds. Camera attention uses a per-run face-position baseline, a broad screen zone, and sustained episodes. A prolonged edge hold (10 seconds) or beyond-zone/face-tracking loss (3 seconds) creates a review event. One episode produces one event. Raw gaze samples do not independently reduce integrity. The camera estimate is based on face landmarks, not calibrated eye tracking; it cannot prove cheating or reliably detect an out-of-frame phone. Screen-corner movement still requires testing across real cameras, glasses, and lighting.

Word/sentence highlight positions are approximate and labeled accordingly. Question boundaries and proctoring event times are captured directly. Older uploads without answer windows retain approximate splitting.

## Build and Service Checks

```sh
docker compose exec fastapi python -m compileall -q backend
docker compose exec react npm run build
docker compose exec react npm audit
docker compose config -q
docker compose ps
```

Automated test cases, synthetic checking scripts, and their labeled generated artifacts have been removed. The practice lab remains a separate user-facing recording feature. Follow the admin setup panel and the real interview walkthrough in `START_HERE.md` to confirm the system on your device.

Dependency note: the current npm audit reports an advisory in Vite's development dependency `picomatch`, including the installed version 4.0.7. A normal dependency update was applied; no forced downgrade of Vite was made. Review this development-tool advisory before public deployment.
