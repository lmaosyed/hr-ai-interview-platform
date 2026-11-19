# Public Reference Projects

Reviewed on **19 November 2026**. These are architectural references, not performance benchmarks or dependencies. We did not import their code, weights, prompts, branding, or datasets. Their feature descriptions do not establish scoring accuracy. Check each repository's current license before reusing code.

## Euron Open Conversation

[Repository](https://github.com/euron-sde-team/euron-open-real-time-ai-conversation-system) · [Server-scoring decision](https://github.com/euron-sde-team/euron-open-real-time-ai-conversation-system/blob/main/docs/architecture/adr/0007-browser-transcript-server-scoring.md) · [Prompt/rubric implementation](https://github.com/euron-sde-team/euron-open-real-time-ai-conversation-system/blob/main/apps/api/src/services/interview/prompts.ts)

Its documented approach keeps scores server-side, validates structured model output, fences untrusted candidate material, applies a deterministic empty-answer floor, and versions scoring work for idempotency. Rubrics publish score bands and separate domain knowledge from communication. Its practice browser can submit a transcript; that trust trade-off is explicitly documented.

**Application here:** keep model calls server-side, publish our actual formulas, never accept client-provided ratings, and retain deterministic empty-answer safeguards. This project transcribes uploaded audio for hiring rather than trusting browser speech recognition as the authoritative transcript. Versioned rubric/model provenance and input-hash caching would be useful next steps, but are not implemented in this revision.

## Aural OSS

[Repository and self-hosting guide](https://github.com/1146345502/aural-oss) · [Score aggregation helper](https://github.com/1146345502/aural-oss/blob/main/src/lib/session-score.ts)

The inspected aggregation helper ignores absent/non-finite values and returns `null` when no usable scores exist; it prefers question-level evaluations before falling back to criteria evaluations. Its documented deployment separates account/data setup from optional voice-provider credentials.

**Application here:** an absent score is "Unscored," not zero or an invented average. The redesigned pipeline fixes this distinction, and setup documentation separates keyless workspace exploration from real inference. Their deployment depends on Supabase/voice services; we keep PostgreSQL, Redis and Mailpit local to reduce reviewer setup cost.

## Dialogue

[Repository and architecture description](https://github.com/deepdotspace/dialogue)

Its README describes a durable scoring job that waits for a finished transcript, writes a report, updates interview state, and exposes progress. The interview itself uses Tavus through DeepSpace; it is a live avatar system, not our asynchronous recorder.

**Application here:** make processing/failure state explicit and recoverable instead of leaving the candidate or reviewer guessing. Our default worker now detects interrupted work on restart and exposes a retry path. An avatar or paid real-time voice service is not needed for the core project.

## Low-Cost Improvement Priorities

| Next improvement | Why it matters | Cost / status |
| --- | --- | --- |
| Version every rubric/model/input in a report | Compare changes honestly rather than guessing why a score moved | Local metadata work; next iteration |
| Human-labeled evaluation set | Measure silence, unrelated, partially correct and strong answers across conditions | Manual time; no automated suites added in this revision |
| Evidence citations from the transcript | Let reviewers verify semantic score claims against actual phrases | Provider tokens + validation; next iteration |
| Overlap-aware proctoring episodes | Avoid treating one tab/fullscreen incident as two independent issues | Local logic; future work |
| Chunked/resumable media uploads | Avoid memory and network failures on long sessions | Browser/backend engineering; future work |
| Local STT benchmark on target hardware | Reduce provider dependence without assuming it will be accurate or fast | Model download, CPU/RAM; optional, not auto-installed |

The immediate improvements in this revision prioritize a reproducible startup, honest missing-score states, focused review sections, and clear boundaries. Additional features should follow measured failures, not competitor feature counts.
