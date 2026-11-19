# Start Here

Run `bash scripts/start.sh`, then open http://localhost:55173.

For a new checkout, start with the [reviewer walkthrough](docs/REVIEWER_GUIDE.md). It takes you from the bootstrap administrator to a recruiter, job, invitation, candidate recording, and HR review. Existing accounts and recordings are preserved.

Practice is separate: http://localhost:55173/hrai/practisesession. It is not linked in the main hiring interface and does not change candidate records.

Meaningful transcription/scoring needs your own valid AI key and available quota. The rest of the local workspace can be explored without a key. Put credentials only in the ignored local `.env`, then recreate `fastapi worker`. No fabricated transcripts or sample scores are substituted when inference is unavailable.

See [README](README.md) for commands, [architecture](docs/ARCHITECTURE.md) for the actual scoring/data flow, [references](docs/REFERENCES.md) for comparable projects, and [security boundaries](SECURITY.md) before any public deployment.
