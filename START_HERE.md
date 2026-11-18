# Start Here

## What This Project Does

Interview Review Studio lets HR run asynchronous interviews on this website. Candidates record spoken answers or submit text/code answers. The backend transcribes the recording, evaluates answers with a rubric, and gives HR a recording, transcript, scores, explanations, and proctoring events. HR makes the decision.

The stack is React/TypeScript, FastAPI, PostgreSQL, Redis, ffmpeg, and Gemini. Docker Compose runs everything locally. Airflow is an optional orchestration demonstration.

## Open the Project

Start Docker Desktop, then run from this project directory:

```sh
docker compose up -d
```

Website: http://localhost:55173

Admin: http://localhost:55173/admin/login

Current administrator: `admin / admin`, unless you changed it. Existing HR accounts from your earlier work are still present. Login forms no longer contain prefilled example passwords.

## What Is Ready

- Admin can create/suspend HR accounts and see their applicants.
- HR can manage jobs, question types, timers, rubrics, invitations, expiry dates, and extensions.
- Candidates complete a profile/resume, select an invited job, and record on this website.
- Main interviews and the separate practice lab share capture, fullscreen, preparation time, and answer timing.
- The processing worker creates transcripts, question scores, speech metrics, and HR review reports.
- HR can search applicants, play recordings, inspect events, add notes, and shortlist/reject.

## The Next Three Steps

1. **Restore AI access.** The old Gemini key is invalid. Generate a replacement in your Google AI Studio account and put it in the local `.env` as `GEMINI_API_KEY`. Use `DEMO_MODE=false`, `LLM_PROVIDER=gemini`, and `TRANSCRIPTION_PROVIDER=gemini`. You do not need an OpenAI key. Recreate the services after editing:

```sh
docker compose up -d --force-recreate fastapi worker
```

Sign in to admin and use **Check AI connection**. A successful connection confirms access to the model; processing still depends on your account quota.

2. **Complete one real interview.** Create an HR login in admin. In HR, create a job with one spoken question, then generate an invitation to your own email. Open the invitation, complete the candidate profile, share the entire screen, allow camera/microphone, and answer. Return to HR and check the recording, transcript, scores, and explanations. This is the completion milestone for a working college demonstration.

3. **Choose email and presentation setup.** For a demonstration on this laptop, invitations are visible at http://localhost:58025. To deliver them to real inboxes, configure your SMTP host, port, username/password, and sender in `.env`. For candidates on other devices, deploy with HTTPS and update `FRONTEND_ORIGIN`; a localhost link only works on this machine.

## What Was Cleaned Up

Automated backend/frontend test files, the synthetic smoke-run script, test commands, and labeled generated artifacts were removed. Startup now creates only an administrator on a new database. Existing candidate profiles and real interview recordings were preserved. The practice lab remains at http://localhost:55173/evaluation-lab for your own recording and model checks.

## What Still Needs Real-World Validation

Camera attention is an approximate review signal, not proof of cheating. Speech delivery and answer scores need comparison against real recordings after the key is replaced. Code answers receive AI rubric review; the project does not execute submitted code in a sandbox. Large recordings still upload as a single request, with retry available while the page stays open.

Once the real interview flow works, you can accurately describe the project on your resume as a full-stack asynchronous interview platform with multimedia capture, a processing queue, rubric evaluation, and explainable HR analytics.
