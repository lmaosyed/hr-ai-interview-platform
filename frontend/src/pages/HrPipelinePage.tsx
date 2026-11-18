import { ArrowRight, BriefcaseBusiness, Funnel, Search, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { fetchHrJobs, searchCandidates } from "../api/client";
import type { CandidateListItem, JobListItem } from "../types/api";
import {
  PIPELINE_STAGES,
  type PipelineStageKey,
  candidateMatchesPipelineStage,
  getCandidateSortScore,
  getJobMatchesSearch,
  getPipelineStageCounts,
} from "../utils/pipeline";
import { getHrSession } from "../utils/session";

type RiskFilter = "all" | "low" | "medium" | "high";

export function HrPipelinePage() {
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<PipelineStageKey>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }

    setLoading(true);
    Promise.all([
      fetchHrJobs(hrSession.hr_user_id),
      searchCandidates(hrSession.hr_user_id, ""),
    ])
      .then(([jobData, candidateData]) => {
        setJobs(jobData);
        setCandidates(candidateData);
      })
      .catch(err => setError(err.message || "Could not load hiring pipeline."))
      .finally(() => setLoading(false));
  }, [hrSession, navigate]);

  const baseFilteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (selectedJobId !== "all" && candidate.job_id !== selectedJobId) {
        return false;
      }
      if (riskFilter !== "all" && candidate.session_score?.risk_level !== riskFilter) {
        return false;
      }
      if (!searchQuery.trim()) {
        return true;
      }
      const search = searchQuery.trim().toLowerCase();
      return [
        candidate.name,
        candidate.email,
        candidate.username,
        candidate.current_role ?? "",
        candidate.job_category ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [candidates, riskFilter, searchQuery, selectedJobId]);

  const stageCounts = useMemo(
    () => getPipelineStageCounts(baseFilteredCandidates),
    [baseFilteredCandidates],
  );

  const visibleCandidates = useMemo(
    () =>
      baseFilteredCandidates
        .filter((candidate) => candidateMatchesPipelineStage(candidate, selectedStage))
        .sort((left, right) => getCandidateSortScore(right) - getCandidateSortScore(left)),
    [baseFilteredCandidates, selectedStage],
  );

  const visibleJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        if (selectedJobId !== "all" && job.id !== selectedJobId) {
          return false;
        }
        if (searchQuery.trim() && !getJobMatchesSearch(job, searchQuery)) {
          const hasCandidateMatch = baseFilteredCandidates.some((candidate) => candidate.job_id === job.id);
          if (!hasCandidateMatch) {
            return false;
          }
        }
        return true;
      })
      .map((job) => {
        const jobCandidates = baseFilteredCandidates.filter((candidate) => candidate.job_id === job.id);
        const stageCandidates = visibleCandidates.filter((candidate) => candidate.job_id === job.id);
        return {
          job,
          counts: getPipelineStageCounts(jobCandidates),
          stageCandidates: stageCandidates.slice(0, 4),
        };
      })
      .filter((row) => row.stageCandidates.length > 0 || row.counts.leads > 0);
  }, [baseFilteredCandidates, jobs, searchQuery, selectedJobId, visibleCandidates]);

  if (!hrSession) {
    return null;
  }

  return (
    <div className="pipeline-page">
      {error ? <p className="status-error" role="alert">{error}</p> : null}
      <header className="page-header pipeline-header">
        <div>
          <span className="eyebrow">Pipeline</span>
          <h1>Track every candidate from invite to decision</h1>
          <p className="muted-copy">
            Review candidates by stage, narrow the queue with filters, and open a job-specific board
            without losing context.
          </p>
        </div>
        <div className="pipeline-header-actions">
          <Link className="secondary-button" to="/hr/candidates">
            <Users size={16} />
            View all candidates
          </Link>
          <Link className="primary-button" to="/hr/jobs">
            <BriefcaseBusiness size={16} />
            Manage jobs
          </Link>
        </div>
      </header>

      <section className="pipeline-stage-strip">
        {PIPELINE_STAGES.map((stage) => (
          <button
            className={`pipeline-stage-card ${selectedStage === stage.key ? "active" : ""}`}
            key={stage.key}
            onClick={() => setSelectedStage(stage.key)}
            type="button"
          >
            <div>
              <div className="pipeline-stage-label-row">
                <strong>{stage.label}</strong>
                {stage.key === "hired" ? <span className="pipeline-stage-note">Manual</span> : null}
              </div>
              <p>{stage.description}</p>
            </div>
            <span className="pipeline-stage-total">{loading ? "..." : stageCounts[stage.key]}</span>
          </button>
        ))}
      </section>

      <section className="chart-card pipeline-filter-card">
        <div className="pipeline-filter-heading">
          <span className="eyebrow">Filters</span>
          <h2>Focus the pipeline</h2>
        </div>
        <div className="pipeline-filter-grid">
          <label className="pipeline-field pipeline-field-search">
            <span className="pipeline-field-label">Search</span>
            <span className="pipeline-inline-input">
              <Search size={16} />
              <input
                placeholder="Search by candidate, role, category, or email"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </span>
          </label>
          <label className="pipeline-field">
            <span className="pipeline-field-label">Job</span>
            <select
              className="pipeline-select"
              value={selectedJobId}
              onChange={(event) =>
                setSelectedJobId(event.target.value === "all" ? "all" : Number(event.target.value))
              }
            >
              <option value="all">All jobs</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.category} · {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="pipeline-field">
            <span className="pipeline-field-label">Risk</span>
            <select
              className="pipeline-select"
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
            >
              <option value="all">All risk levels</option>
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
            </select>
          </label>
          <button
            className="secondary-button pipeline-clear-button"
            onClick={() => {
              setSearchQuery("");
              setSelectedJobId("all");
              setRiskFilter("all");
            }}
            type="button"
          >
            <Funnel size={16} />
            Clear filters
          </button>
        </div>
      </section>

      <section className="pipeline-results-summary">
        <div className="pipeline-results-pill">
          {loading ? "Loading pipeline..." : `${visibleCandidates.length} candidates in ${PIPELINE_STAGES.find((stage) => stage.key === selectedStage)?.label}`}
        </div>
        <p className="muted-copy">
          Leads covers the full applicant pool, Application Review shows who still needs the test,
          and Active highlights candidates ready for the next round.
        </p>
      </section>

      <section className="pipeline-job-list">
        {visibleJobs.map(({ job, counts, stageCandidates }) => (
          <article className="pipeline-job-card" key={job.id}>
            <div className="pipeline-job-header">
              <div>
                <span className="mini-tag">{job.category}</span>
                <h2>{job.title}</h2>
                <p className="muted-copy">{job.description}</p>
              </div>
              <div className="pipeline-job-actions">
                <Link className="secondary-button small" to={`/hr/jobs/${job.id}`}>
                  Open board
                </Link>
                <Link className="text-link" to={`/hr/jobs/${job.id}/analytics`}>
                  View job report
                </Link>
              </div>
            </div>

            <div className="pipeline-job-metrics">
              <div className="pipeline-job-metric">
                <span>Leads</span>
                <strong>{counts.leads}</strong>
              </div>
              <div className="pipeline-job-metric">
                <span>Application Review</span>
                <strong>{counts.application_review}</strong>
              </div>
              <div className="pipeline-job-metric">
                <span>Active</span>
                <strong>{counts.active}</strong>
              </div>
              <div className="pipeline-job-metric">
                <span>Pending Offer</span>
                <strong>{counts.pending_offer}</strong>
              </div>
              <div className="pipeline-job-metric">
                <span>Archived</span>
                <strong>{counts.archived}</strong>
              </div>
            </div>

            <div className="pipeline-preview-list">
              {stageCandidates.length ? (
                stageCandidates.map((candidate) => (
                  <button
                    className="pipeline-preview-item"
                    key={candidate.id}
                    onClick={() => navigate(`/hr/jobs/${job.id}?candidateId=${candidate.id}`)}
                    type="button"
                  >
                    <div>
                      <strong>{candidate.name}</strong>
                      <p>
                        {candidate.current_role ?? "Candidate"} · {candidate.email}
                      </p>
                    </div>
                    <div className="pipeline-preview-meta">
                      <span className="mini-tag">{candidate.status}</span>
                      <span className="mini-tag">
                        {Math.max(0, Math.round(candidate.session_score?.overall_score ?? 0))}
                      </span>
                      <ArrowRight size={16} />
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-panel">
                  <Sparkles size={18} />
                  <span>No candidates for this job in the current stage/filter combination.</span>
                </div>
              )}
            </div>
          </article>
        ))}

        {!loading && !visibleJobs.length ? (
          <div className="empty-panel">No jobs or candidates match the current pipeline filters.</div>
        ) : null}
      </section>
    </div>
  );
}
