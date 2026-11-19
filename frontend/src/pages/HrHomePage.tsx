import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { fetchHrJobs, searchCandidates } from "../api/client";
import type { CandidateListItem, JobListItem } from "../types/api";
import { getHrSession } from "../utils/session";

export function HrHomePage() {
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }

    setLoading(true);
    let active = true;
    Promise.all([
      fetchHrJobs(hrSession.hr_user_id),
      searchCandidates(hrSession.hr_user_id, ""),
    ])
      .then(([jobsData, candidateData]) => {
        if (!active) return;
        setJobs(jobsData);
        setCandidates(candidateData);
      })
      .catch(err => { if (active) setError(err.message || "Could not load dashboard data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hrSession, navigate]);

  const metrics = useMemo(() => {
    const shortlisted = candidates.filter((candidate) => candidate.status === "shortlisted").length;
    const rejected = candidates.filter((candidate) => candidate.status === "rejected").length;
    const undecided = candidates.filter((candidate) =>
      ["pending", "completed", "reviewed"].includes(candidate.status),
    ).length;
    return {
      templates: jobs.length,
      candidates: candidates.length,
      shortlisted,
      rejected,
      undecided,
    };
  }, [candidates, jobs]);

  if (!hrSession) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h1>Welcome, {hrSession.name.split(" ")[0]}</h1>
          <p className="muted-copy">Your hiring day, at a glance.</p>
        </div>
        <Link className="primary-button" to="/hr/invites">Invite candidates</Link>
      </header>

      <section className="metrics-grid">
        {error ? <p className="status-error" role="alert">{error}</p> : null}
        <div className="metric-card">
          <span>Interview jobs</span>
          <strong>{loading ? "..." : metrics.templates}</strong>
        </div>
        <div className="metric-card">
          <span>Total candidates</span>
          <strong>{loading ? "..." : metrics.candidates}</strong>
        </div>
        <div className="metric-card">
          <span>Yet to decide</span>
          <strong>{loading ? "..." : metrics.undecided}</strong>
        </div>
        <div className="metric-card">
          <span>Shortlisted</span>
          <strong>{loading ? "..." : metrics.shortlisted}</strong>
        </div>
      </section>

      <div className="portal-layout">
        <section className="chart-card">
          <div className="section-heading compact">
            <h2>Where to next?</h2>
          </div>
          <div className="portal-card-grid">
            <Link className="portal-card" to="/hr/pipeline">
              <div>
                <strong>Open pipeline</strong>
                <p>Jump into stage-based review, filters, and job-by-job tracking.</p>
              </div>
            </Link>
            <Link className="portal-card" to="/hr/candidates">
              <div>
                <strong>Review candidates</strong>
                <p>Open the global candidate workspace with search, notes, and decision actions.</p>
              </div>
            </Link>
            <Link className="portal-card" to="/hr/jobs">
              <div>
                <strong>Manage jobs</strong>
                <p>Create templates, edit interview questions, and duplicate job setups.</p>
              </div>
            </Link>
          </div>
        </section>

        <section className="chart-card">
          <div className="section-heading compact">
            <h2>Recent candidates</h2>
          </div>
          <div className="notes-stack">
            {candidates.slice(0, 6).map((candidate) => (
              <Link className="timeline-item recent-person" to={`/hr/candidates?candidateId=${candidate.id}`} key={candidate.id}>
                <strong>{candidate.name}</strong>
                <span>
                  {candidate.job_category} · {candidate.status} · {candidate.email}
                </span>
              </Link>
            ))}
            {!loading && !candidates.length ? <p className="muted-copy">No candidates yet.</p> : null}
            {loading ? <p className="muted-copy">Loading your dashboard metrics...</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
