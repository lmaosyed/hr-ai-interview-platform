import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchHrJobs, searchCandidates } from "../api/client";
import type { CandidateListItem, JobListItem } from "../types/api";
import { PIPELINE_STAGES, candidateMatchesPipelineStage, type PipelineStageKey } from "../utils/pipeline";
import { getHrSession } from "../utils/session";

export function HrPipelinePage() {
  const [session] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [stage, setStage] = useState<PipelineStageKey>("leads");
  const [query, setQuery] = useState("");
  const [jobId, setJobId] = useState("all");
  const [risk, setRisk] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let active = true;
    Promise.all([fetchHrJobs(session.hr_user_id), searchCandidates(session.hr_user_id, "")])
      .then(([jobData, people]) => { if (active) { setJobs(jobData); setCandidates(people); } })
      .catch(err => { if (active) setError(err.message || "Could not load the pipeline."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  const filtered = candidates.filter(candidate => {
    const job = jobs.find(item => item.id === candidate.job_id);
    return (jobId === "all" || candidate.job_id === Number(jobId))
      && (risk === "all" || candidate.session_score?.risk_level === risk)
      && [candidate.name, candidate.email, job?.title, candidate.job_category].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
  const visible = filtered.filter(candidate => candidateMatchesPipelineStage(candidate, stage));
  const selectedStage = PIPELINE_STAGES.find(item => item.key === stage)!;

  return (
    <div className="dashboard-layout workspace-page">
      <header className="page-header">
        <div><span className="eyebrow">Hiring workspace</span><h1>Candidate pipeline</h1><p className="muted-copy">One queue, from invitation to your decision.</p></div>
        <Link className="primary-button" to="/hr/invites"><Plus size={17} />Invite candidates</Link>
      </header>
      {error ? <p className="status-error" role="alert">{error}</p> : null}
      <section className="workbench">
        <div className="pipeline-tabs" aria-label="Pipeline stages">
          {PIPELINE_STAGES.filter(item => item.key !== "hired").map(item => (
            <button key={item.key} className={`pipeline-tab ${stage === item.key ? "active" : ""}`} aria-pressed={stage === item.key} onClick={() => setStage(item.key)}>
              {item.label}<span>{loading ? "..." : filtered.filter(candidate => candidateMatchesPipelineStage(candidate, item.key)).length}</span>
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <label className="table-search"><Search size={17} /><input aria-label="Search pipeline" placeholder="Search names, emails, or roles" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <select aria-label="Filter by job" value={jobId} onChange={event => setJobId(event.target.value)}><option value="all">All jobs</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select>
          <select aria-label="Filter by integrity risk" value={risk} onChange={event => setRisk(event.target.value)}><option value="all">All review signals</option><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option></select>
        </div>
        <p className="table-context">{selectedStage.description} {stage === "pending_offer" ? "This is a shortlist, not an offer-management workflow." : ""}</p>
        <div className="table-scroll">
          <table className="records-table">
            <thead><tr><th>Candidate</th><th>Job / category</th><th>Stage</th><th>Content score</th><th>Integrity review</th><th>Invited</th></tr></thead>
            <tbody>{visible.map(candidate => <tr key={candidate.id}>
              <td><Link className="person-link" to={`/hr/candidates?candidateId=${candidate.id}`}><strong>{candidate.name}</strong><span>{candidate.email}</span></Link></td>
              <td><strong>{jobs.find(job => job.id === candidate.job_id)?.title ?? "Interview"}</strong><small>{candidate.job_category}</small></td>
              <td><span className="mini-tag">{candidate.status}</span></td>
              <td>{candidate.session_score?.overall_score != null ? <span className="table-score">{Math.round(candidate.session_score.overall_score)}<small>/100</small></span> : <span className="muted-copy">Unscored</span>}</td>
              <td>{candidate.session_score ? <span className={`risk-text risk-${candidate.session_score.risk_level}`}>{candidate.session_score.risk_level} risk</span> : <span className="muted-copy">Not analyzed</span>}</td>
              <td className="muted-copy">{new Date(candidate.applied_at).toLocaleDateString()}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {loading ? <div className="quiet-empty" role="status">Loading candidates...</div> : !visible.length ? <div className="quiet-empty"><h3>{candidates.length ? "No candidates in this view" : "Your pipeline starts with an invitation"}</h3><p>{candidates.length ? "Try another stage or adjust your filters." : "Create a job and send your first candidate an interview link."}</p><Link className="text-link" to={jobs.length ? "/hr/invites" : "/hr/jobs"}>{jobs.length ? "Invite a candidate" : "Create your first job"}</Link></div> : null}
        <div className="table-footer">{loading ? "Loading" : `${visible.length} candidate${visible.length === 1 ? "" : "s"}`}<span>Content and integrity are reviewed separately.</span></div>
      </section>
    </div>
  );
}
