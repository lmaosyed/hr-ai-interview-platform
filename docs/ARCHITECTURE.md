# Architecture and Evaluation

## Component Boundaries

| Component | Responsibility | Engineering concept |
| --- | --- | --- |
| React client | Role-specific UI, consent, MediaRecorder, answer windows and browser telemetry | Event capture / ingestion client |
| FastAPI | Typed validation, signed sessions, ownership, uploads, job/application management | Ingestion and serving layer |
| PostgreSQL | Jobs, applications, session state, scored responses, notes, pipeline runs | Operational system of record |
| Redis | Session IDs awaiting processing; worker heartbeat | Queue / producer-consumer decoupling |
| Python worker | Claims pending sessions, calls transformation stages, persists state | ETL orchestration |
| ffmpeg | Audio extraction, silence/activity measurements, question-window cuts | Media transformation |
| Provider adapters | Transcription and structured answer evaluation | External inference boundary |
| Local storage | Separate original recordings and derived JSON/audio | Raw and processed data layers |
| Optional Airflow | DAG-based alternative to the default consumer | Scheduling, retries and task observability |

## Upload to Report

1. Candidate login establishes an in-memory signed session. HR/admin sessions are stored locally with eight-hour signed tokens; the server rechecks active accounts and ownership.
2. Interview access verifies the candidate, invitation expiry, profile completion, and application state. A browser click requests entire-screen capture before asynchronous permission work consumes the user gesture. Fullscreen is required before answering.
3. The shared capture hook records webcam/audio and screen separately. Each question has preparation time and an exact answer window. It logs browser events and approximate camera-attention samples. The main and practice flows use this hook, not two independently tuned recorders.
4. FastAPI validates metadata, locks the candidate row, rejects a second submission, streams files to the raw layer, commits the session/application, and queues the session ID. A queue failure does not discard the committed recording.
5. The default worker conditionally claims pending rows. If Redis lost a queue item, it scans the database for pending uploads. A PostgreSQL advisory lock allows one default worker; at startup, interrupted processing rows become failed with a visible retry reason. Do not combine this worker with Airflow.
6. Processing runs `extract_audio -> transcribe_audio -> split_by_question -> score_answers -> analyze_gaze -> score_confidence -> score_integrity -> generate_summary -> update_status`. A failure records the stage/message. Reprocessing replaces derived response/score rows while retaining the raw upload.
7. HR reads persisted facts through ownership-scoped APIs. Content evidence, integrity observations and human decisions remain distinct.

Practice calls the same evaluation services synchronously off the API event loop where blocking work occurs, then stores a separate lab report. It does not use the main candidate queue. Configuration/transcripts can differ; shared services do not guarantee identical scores for different inputs.

A job with invitations cannot be edited/deleted through HR. Invitation creation and job edits lock the same job row so an in-flight invitation cannot race an edit. HR duplicates a used job for a new question set, keeping scoring inputs stable for existing applicants.

## Storage Layout

```text
storage/
  raw/{session_id}/
    webcam.webm, screen.webm, audio.webm
    gaze.json, integrity_events.json, typed_answers.json, answer_windows.json
  processed/{session_id}/
    extracted audio, transcripts, question segments, score/summary JSON
  raw/lab/{practice_id}/
  processed/lab/{practice_id}/
```

Raw uploads are retained as source evidence and are not overwritten by scoring retries. This is an application convention, not a WORM/cryptographically immutable store. No real recordings or derived personal data are in Git. Protected asset access checks ownership; signed URLs contain session tokens and should not be shared.

## Data Model

`admin_users -> hr_users -> jobs -> candidates -> sessions` describes provisioning and ownership. A candidate/application row belongs to one recruiter/job; applications with the same email can be shown together to the candidate. This is currently an MVP credential model, not a standalone production identity service.

Sessions have question responses, gaze snapshots, integrity events, HR notes, pipeline runs, and a session score. Question configuration lives as JSONB on the job; analytical explanations/highlights also use structured JSON. Job analytics aggregate scored candidates without treating unscored sessions as zero.

This is a normalized relational serving schema with derived facts. A future warehouse could expose candidate/job/question dimensions and session/question score facts; the current database is not advertised as a dimensional warehouse. Schema startup uses `create_all` plus additive compatibility statements; Alembic migrations remain future work.

## Published Scoring Rules

```text
question_answer_quality = relevance * 0.40 + depth * 0.40 + communication * 0.20
question_aggregation_weight = configured_weight * difficulty_weight
overall = answer_quality * 0.55 + delivery * 0.25 + communication * 0.20
```

The scorer returns validated finite 0-100 values and a short question summary. HR's optional evaluation focus/traits/red flags guide the rubric; otherwise a general rubric applies. Empty responses receive zero content credit instead of model-invented scores. Spoken answers use the recorded answer windows, not preparation time. Text/code answers use submitted text; code is never executed on the server.

The API's legacy field `confidence_score` means observable **delivery**, not inferred personality or emotion. It uses transcript evidence, pace, whole-word filler counts, and measured audio gaps. No meaningful transcript or speech yields zero delivery credit. Background noise and transcription errors can affect these measures. None of these heuristics is a validated hiring assessment.

The recommendation band follows the overall content/delivery score: strong >=80, likely >=70, weak >=55, otherwise not recommended. Integrity is not in the weighted total and does not change that band. Communication contributes both to question quality and the total; these dimensions are correlated, not independent statistical estimates.

## Proctoring Boundaries

Tab/fullscreen slips under 1.5 seconds have a grace period. Camera attention uses a short per-run baseline and broad normalized screen zone; sustained edge holds (10 seconds), beyond-zone movements, or face-tracking loss (3 seconds) produce review episodes. Raw gaze samples alone do not create extra score deductions. Overlapping browser signals may describe the same incident and should be reviewed together.

MediaPipe face landmarks are an approximate attention/head-position estimate, not calibrated pupil tracking. They cannot reliably identify off-frame phones, establish what someone is reading, or prove cheating. Camera behavior does not lower content/delivery scores. Reviewers should allow accommodations and use the recording, not automatically reject on a flag.

Question start/end and browser event times are captured directly. Word/sentence/highlight times are approximate unless a transcription provider supplies exact alignment. The UI labels these as approximate.

## Source Map

| Path | Start here for |
| --- | --- |
| `frontend/src/hooks/useSessionCapture.ts` | Shared recording, preparation, fullscreen and upload logic |
| `frontend/src/utils/attention.ts` | Sustained attention-event thresholds |
| `backend/routers/interview.py` | Access rules, upload and duplicate guard |
| `backend/routers/hr.py` | Recruiter resources, invitations, notes, decisions |
| `backend/services/worker.py` | Default consumer and restart handling |
| `backend/services/pipeline.py` | Persisted interview transformation stages |
| `backend/services/scoring.py` | Deterministic formulas and explanation helpers |
| `backend/services/llm.py` | Rubric prompts and provider response validation |
| `backend/services/transcription.py` | Provider transcription / silence guard |
| `backend/dags/process_interview_session.py` | Optional Airflow orchestration |
