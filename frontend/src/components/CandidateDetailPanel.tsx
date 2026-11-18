import { AlertTriangle, CheckCircle2, Clock4, FileVideo, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";

import { getAssetUrl, retryCandidateProcessing } from "../api/client";
import type { CandidateDetail, CandidateStatus } from "../types/api";
import { ConfidenceBreakdownChart } from "./ConfidenceBreakdownChart";
import { MetricCard } from "./MetricCard";
import { QuestionResponsesPanel } from "./QuestionResponsesPanel";
import { TimelineHeatmap } from "./TimelineHeatmap";

type Props = {
  candidate: CandidateDetail | null;
  noteValue: string;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void | Promise<void>;
  onStatusChange: (status: CandidateStatus) => void | Promise<void>;
  onExtendDeadline: (hours: number | null) => void | Promise<void>;
};

export function CandidateDetailPanel({
  candidate,
  noteValue,
  onNoteChange,
  onSaveNote,
  onStatusChange,
  onExtendDeadline,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  async function perform(action: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await action(); } catch (err) { setActionError(err instanceof Error ? err.message : "Could not save the change."); }
    finally { setBusy(false); }
  }
  if (!candidate) {
    return <div className="detail-placeholder">Select a candidate to load the review panel.</div>;
  }

  const score = candidate.session_score;

  return (
    <div className="detail-panel">
      <header className="candidate-detail-header">
        <div className="candidate-avatar">{candidate.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <h2>{candidate.name}</h2>
          <p>
            {candidate.username} · {candidate.current_role ?? candidate.job_title} · {candidate.job_category} ·{" "}
            {candidate.duration_seconds ?? 0}s session · Applied {new Date(candidate.applied_at).toLocaleDateString()}
          </p>
          {candidate.resume_url ? (
            <a className="text-link" href={getAssetUrl(candidate.resume_url)} target="_blank" rel="noreferrer">
              View uploaded resume
            </a>
          ) : null}
        </div>
        <div className="detail-actions">
          <button disabled={busy} className="primary-button small" onClick={() => void perform(() => onStatusChange("shortlisted"))}>
            Move to Round 2
          </button>
          <button disabled={busy} className="secondary-button small" onClick={() => void perform(() => onStatusChange("rejected"))}>
            Reject
          </button>
        </div>
      </header>
      {actionError ? <p className="status-error" role="alert">{actionError}</p> : null}
      {candidate.processing_status === "failed" ? <section className="note-card">
        <strong>Analysis needs attention</strong>
        <p>{candidate.processing_error ?? "The recording was saved, but analysis failed. Check the AI service before retrying."}</p>
        <button className="secondary-button small" disabled={busy} onClick={() => void perform(async () => {
          await retryCandidateProcessing(candidate.id);
          setActionError("Recording queued for analysis. Reopen this candidate shortly to see the result.");
        })}>Retry analysis of saved recording</button>
      </section> : null}

      <section className="metrics-grid">
        <MetricCard label="Answer quality" value={score?.answer_quality_score} />
        <MetricCard label="Confidence" value={score?.confidence_score} />
        <MetricCard label="Integrity" value={score?.integrity_score} />
        <MetricCard label="Communication" value={score?.communication_score} />
      </section>

      <section className="session-replay-card">
        <div className="section-heading compact">
          <span className="eyebrow">Replay</span>
          <h3>Session recording</h3>
        </div>
        {candidate.raw_video_path && !candidate.raw_video_path.includes("mock") ? (
          <video ref={videoRef} key={candidate.session_id} controls preload="metadata" src={getAssetUrl(candidate.raw_video_path)} style={{ width: "100%", maxHeight: 460, borderRadius: 16 }} />
        ) : <div className="session-replay-body">
          <FileVideo size={28} />
          <div>
            <strong>No playable recording available</strong>
            <p>Demo records may contain scores without an uploaded video.</p>
          </div>
        </div>}
      </section>

      {candidate.deadline_extension_requested_at ? (
        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Deadline request</span>
            <h3>Candidate asked for more time</h3>
          </div>
          <div className="note-card">
            <p>
              Requested {new Date(candidate.deadline_extension_requested_at).toLocaleString()}
            </p>
            <p>{candidate.deadline_extension_reason ?? "No reason was supplied."}</p>
          </div>
          <div className="button-row">
            <button disabled={busy} className="secondary-button small" onClick={() => void perform(() => onExtendDeadline(24))}>
              Grant 24h
            </button>
            <button disabled={busy} className="secondary-button small" onClick={() => void perform(() => onExtendDeadline(48))}>
              Grant 48h
            </button>
            <button disabled={busy} className="secondary-button small" onClick={() => void perform(() => onExtendDeadline(72))}>
              Grant 72h
            </button>
            <button disabled={busy} className="secondary-button small" onClick={() => void perform(() => onExtendDeadline(null))}>
              Remove deadline
            </button>
          </div>
        </section>
      ) : null}

      <div className="two-column-detail">
        <ConfidenceBreakdownChart breakdown={score?.score_breakdown} />
        <TimelineHeatmap
          durationSeconds={candidate.duration_seconds}
          events={score?.timeline_events ?? []}
          onSeek={seconds => { if (videoRef.current) { videoRef.current.currentTime = seconds; void videoRef.current.play().catch(() => {}); } }}
        />
      </div>

      <section className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Integrity</span>
          <h3>Event log and risk scoring</h3>
        </div>
        <div className="explainability-grid">
          <div className="explainability-column">
            <span className="pill-label risk">{score?.risk_level ?? "n/a"} risk</span>
            {(score?.explainability?.content_reasons ?? []).map((reason) => (
              <div className="log-item" key={reason}>
                <CheckCircle2 size={18} />
                <span>{reason}</span>
              </div>
            ))}
            {(score?.explainability?.integrity_reasons ?? []).map((reason) => (
              <div className="log-item" key={reason}>
                <ShieldAlert size={18} />
                <span>{reason}</span>
              </div>
            ))}
            {candidate.integrity_events.map((event) => (
              <div className="log-item" key={event.id}>
                {event.severity === "low" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span>
                  {event.description} · {event.timestamp_seconds.toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
          <div className="explainability-column">
            <span className="pill-label">AI score reasoning</span>
            {score?.explainability?.score_model_note ? (
              <div className="log-item">
                <CheckCircle2 size={18} />
                <span>{score.explainability.score_model_note}</span>
              </div>
            ) : null}
            {(score?.explainability?.confidence_reasons ?? []).map((reason) => (
              <div className="log-item" key={reason}>
                <Clock4 size={18} />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <QuestionResponsesPanel
        questions={candidate.question_responses}
        typedResponses={candidate.typed_responses}
      />

      <section className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Summary</span>
          <h3>AI recommendation</h3>
        </div>
        <p className="summary-copy">{score?.ai_summary ?? "Awaiting AI summary."}</p>
      </section>

      <section className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">HR notes</span>
          <h3>Reviewer collaboration</h3>
        </div>
        <div className="notes-stack">
          {candidate.hr_notes.map((note) => (
            <div className="note-card" key={note.id}>
              <strong>{note.hr_user}</strong>
              <p>{note.note}</p>
            </div>
          ))}
        </div>
        <textarea
          className="note-input"
          placeholder="Add a note for the hiring team..."
          value={noteValue}
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <button disabled={busy || !candidate.session_id} className="primary-button small" onClick={() => void perform(onSaveNote)}>
          Save note
        </button>
      </section>
    </div>
  );
}
