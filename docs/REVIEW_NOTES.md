# Manual Review Notes

Date: **19 November 2026**. These are verification notes, not an automated test suite or a claim that the system is production-ready.

## Setup Used

A source-only copy was started in a temporary directory with a separate Compose project, new PostgreSQL/Redis volumes, separate storage, different host ports, and `.env.example` credentials. No author's `.env`, recordings, resumes, model key, or database was copied. The existing local project data was left intact.

The startup launcher built the stack, created only the administrator, and the UI correctly reported missing AI setup. An HR account, job, and invitation were then created through the browser. Screenshot records are fictional reviewer entries, not seeded candidates.

## Observed Checks

| Check | Observed result |
| --- | --- |
| Fresh Docker startup | API, database, queue, mail capture, frontend and worker started on alternate ports |
| Empty database | Only bootstrap admin; zero jobs/HRs/candidates before manual creation |
| Admin/HR browser login | Admin provisioned HR; HR opened welcome overview |
| Job editor | Created a spoken-question role; advanced rubric is expandable |
| Invitation | Browser generated credentials, expiry and a link using the configured frontend port; local mail delivery reported sent |
| Profile validation | Missing experience returned 422; zero years plus a generated resume was accepted |
| Upload/queue/worker | Valid generated silent WebM uploaded; worker reached `done` |
| No-answer safeguard | Answer quality, delivery, communication and overall were all **0**, not a fabricated passing score |
| Repeat submission | Same application upload returned **409** |
| API access boundaries | Unauthenticated HR request **401**; another HR ID **403** |
| Recording playback endpoint | No token **401**; authorized byte range **206** |
| Notes and analytics | Note creation and job analytics returned **200** |
| Report UI | Overview, Answers & transcript, Integrity review, Notes & deadline opened |
| HR idle behavior | Zero additional HR API requests during a 3.5-second idle observation; no repeated-fetch loop observed |
| Candidate state | Completed role was not available as a new interview; refresh returned to candidate login |
| Practice separation | Old route redirected to `/hrai/practisesession`; main landing has only candidate/recruiter entries |
| Used-job safeguards | Edit/delete returned **409**; duplicate **201**; unused copy remained editable/deletable |
| Interrupted worker | Isolated saved session marked interrupted, worker restarted, failure reason appeared; retry completed and retry count became **1** |
| Build/static checks | TypeScript/Vite build, Python compile, Compose configuration and launcher shell syntax passed |
| Dependency snapshot | `npm audit` reported **0 vulnerabilities** at review time; this is not a permanent security guarantee |

## Fixes from Review

API addresses and asset URLs now support the same-origin proxy. Practice is isolated. Missing scores no longer turn into zero in the pipeline. Candidate-detail actions guard against a delayed response overwriting a newly selected candidate. The duplicate job review implementation redirects to one shared review workspace. Pending uploads are recovered and interrupted default-worker sessions become explicitly retryable. Jobs with candidates cannot be removed or silently changed under an interview.

## Not Verified / Still Limited

Real semantic transcription/scoring accuracy was **not** validated: the isolated setup intentionally had no usable AI credentials. No real person's recording was sent to a provider. A successful silent recording checks the deterministic no-answer path, not model quality.

Native laptop camera/mic/screen-selection dialogs, sustained gaze accuracy with glasses/lighting, real-inbox SMTP delivery, heavy concurrent usage, long-upload recovery, and the optional Airflow runtime were not revalidated in this pass. Browser UI and API/media paths were checked; this does not substitute for a real-device candidate run.

The Recharts build chunk remains larger than Vite's 500 KB warning threshold. Practice and report pages are lazy-loaded, but further chart splitting is possible. Public-deployment security gaps are documented in `SECURITY.md`; no production-safety or unbiased-hiring claim is made.

No automated test-case files, score fixtures, synthetic recordings, or generated lab reports were added to the repository. Temporary manual-review data lived only in the isolated stack.
