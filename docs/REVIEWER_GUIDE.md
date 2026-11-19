# Reviewer Walkthrough

This walkthrough creates your own records on a new local installation. It does not rely on the author's database or API keys.

## 1. Start and Sign In

Run `bash scripts/start.sh` from the repository root. Open http://localhost:55173/admin/login and sign in as `admin / admin` (unless you changed the bootstrap credentials before first startup).

The empty overview should show zero HRs and candidates. Database, queue, and worker should be connected. With no API key, AI setup should say that configuration is required. This is expected, not a broken startup.

## 2. Provision a Recruiter

Create an HR with a name, email, username, and password of at least six characters. Example: `Reviewer HR`, `reviewer@example.com`, `reviewer_hr`, and a password you choose. Sign in at `/hr/login`. You should see a welcome overview with no sample candidates.

The top bar has Overview, Pipeline, Candidates, Jobs, Reports, global search, Invite, and profile/logout. There is no practice tab.

## 3. Build a Job

Open Jobs, then New job. Example:

| Field | Value |
| --- | --- |
| Title | Backend Engineering Intern |
| Category | Software Engineering |
| Description | Build reliable APIs and explain database trade-offs. |
| Spoken question | Explain when a database index helps and when it can make writes slower. |
| Time | 120 seconds |
| Optional evaluation focus | Explain a concrete example and a read/write trade-off. |

Add a second text/code question if desired. Optional instructions and rubric live in an expandable section. The quality checker is a structural aid, not a guarantee that a question is fair or job-valid. Save the job.

Once a job has invitations, its configuration is locked to preserve candidate history. Duplicate it to change questions/timers for a new cohort. Only unused jobs can be deleted.

## 4. Invite and Complete a Profile

Use Invite, select the job, choose 12/24/48/72 hours or no expiry, and enter a candidate email. Mailpit at http://localhost:58025 captures the message without sending external mail. The generated card also provides login details. Bulk invitations use the same selected job.

Open the invitation in a second browser or private window. Complete the candidate's name, current role, years of experience (zero is valid), and upload a PDF/DOC/DOCX resume up to 10 MB. Missing fields must be identified before proceeding. The HR can later open that resume.

## 5. Record an Interview

Select the interview card and read the centered overview/consent. Continue from the button to request screen, camera, and microphone access. Choose **Entire Screen**. Window/tab sharing is rejected explicitly. Allow OS screen-recording/camera/mic permission if prompted; a browser restart can be required after changing OS permissions.

Fullscreen starts before answering; browser security may require an additional click. Each question has 30 seconds of preparation, then its answer timer. You can begin early. Speak normally or type an answer. Finish/upload once. The same invitation must not allow another submission.

Without valid AI credentials, the recording can be saved but meaningful analysis will fail explicitly. With credentials, the worker transcribes/scores the answer windows and produces a report. A silent answer must not earn a fabricated high score. Candidate refresh signs out intentionally.

## 6. Review as HR

Open Pipeline and select the candidate's name. Use Overview for summary and playback, Answers & transcript for question-level evidence/search/highlights, Integrity review for observational signals, and Notes & deadline for collaboration or extension requests. Shortlist or reject is a human action. Reports can be filtered to a job.

If analysis failed, the report shows a reason and a retry action using the saved recording. Fix provider configuration, recreate FastAPI/worker, sign in again if needed, and retry. Scores remain unscored rather than defaulting to a plausible number.

## Independent Practice

Open http://localhost:55173/hrai/practisesession directly. It uses the shared recorder and evaluation services but writes separate lab artifacts, not candidate records. It is for repeated manual model/capture checks. It does not require an HR invitation and is not linked in the main hiring UI.

## If Something Goes Wrong

| Symptom | Check |
| --- | --- |
| Docker unavailable | Start Docker Desktop; rerun the launcher. |
| Port already allocated | Change the corresponding host port in `.env`. |
| AI key/model/quota error | Use your own key, check model access, recreate `fastapi worker`. Never use a key from a screenshot/chat. |
| Email not in real inbox | Expected with Mailpit; inspect the local inbox. |
| Permission prompt missing | Use desktop Chrome/Edge, site permissions, and OS privacy settings. |
| Screen rejected | Select Entire Screen, not Window or Browser Tab. |
| Fullscreen not entered | Click the displayed fullscreen action; browsers can require a fresh user gesture. |
| Login no longer valid | Sign in again. Candidate refresh is intentionally nonpersistent. |
| Analysis failed after restart | HR can retry the saved recording; inspect `docker compose logs --tail=80 worker`. |

Stopping services preserves data. Do not delete volumes to fix an ordinary login or configuration error.
