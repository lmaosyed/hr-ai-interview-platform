import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSystemStatus } from "../api/client";
import type { SystemStatus } from "../types/api";

export function AdminSetupPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchSystemStatus().then(value => { if (active) setStatus(value); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  async function checkConnection() {
    if (checking) return;
    setChecking(true); setError("");
    try { setStatus(await fetchSystemStatus(true)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not check system setup."); }
    finally { setChecking(false); }
  }

  return <section className="chart-card" aria-label="Platform setup">
    <div className="section-heading compact">
      <span className="eyebrow">Setup</span>
      <h2>Ready for your next interview?</h2>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : null}
    {!status ? <p className="muted-copy">Checking local services...</p> : <>
      <div className="metrics-grid">
        <div className="detail-card"><strong>Database</strong><p>{status.database_ready ? "Connected" : "Needs attention"}</p></div>
        <div className="detail-card"><strong>Processing</strong><p>{status.queue_ready && status.worker_ready ? "Worker running" : "Start the queue and processing worker"}</p></div>
        <div className="detail-card"><strong>AI evaluation</strong><p>{status.ai_state === "ready" ? "Connection verified" : status.ai_state === "blocked" ? "Setup required" : "Check connection"}</p></div>
        <div className="detail-card"><strong>Invitation emails</strong><p>{status.email_mode === "local" ? "Local inbox only" : status.email_mode === "external" ? "SMTP configured" : "Setup required"}</p></div>
      </div>
      <p className={status.ai_state === "blocked" ? "status-error" : "muted-copy"}>{status.ai_message}</p>
      <p className="muted-copy">{status.email_message}</p>
    </>}
    <div className="button-row">
      <button className="secondary-button" disabled={checking} onClick={() => void checkConnection()}>
        {checking ? "Checking AI connection..." : "Check AI connection"}
      </button>
      {status?.local_inbox_url ? <a className="text-link" target="_blank" rel="noreferrer" href={status.local_inbox_url}>Open local email inbox</a> : null}
      <Link className="text-link" to="/hr/login">Open HR workspace</Link>
    </div>
    <ol className="muted-copy">
      <li>Verify the AI connection using your Gemini key.</li>
      <li>Create an HR account below, then sign in to the HR workspace.</li>
      <li>Create a job with questions, send an invitation, and complete one interview.</li>
      <li>Review the recording, transcript, scores, and your final hiring decision in HR.</li>
    </ol>
  </section>;
}
