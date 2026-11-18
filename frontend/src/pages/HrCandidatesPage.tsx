import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  addHrNote,
  extendCandidateDeadline,
  fetchCandidateDetail,
  fetchHrJobs,
  searchCandidates,
  updateCandidateStatus,
} from "../api/client";
import { CandidateDetailPanel } from "../components/CandidateDetailPanel";
import { CandidateList } from "../components/CandidateList";
import type { CandidateDetail, CandidateListItem, CandidateStatus, JobListItem } from "../types/api";
import { type PipelineStageKey, candidateMatchesPipelineStage } from "../utils/pipeline";
import { getHrSession } from "../utils/session";

type StatusView = "all" | PipelineStageKey;

export function HrCandidatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [statusView, setStatusView] = useState<StatusView>(
    (searchParams.get("stage") as StatusView | null) ?? "all",
  );
  const [selectedJobId, setSelectedJobId] = useState<number | "all">(
    searchParams.get("jobId") ? Number(searchParams.get("jobId")) : "all",
  );
  const [allCandidates, setAllCandidates] = useState<CandidateListItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
    searchParams.get("candidateId") ? Number(searchParams.get("candidateId")) : null,
  );
  const [candidateDetail, setCandidateDetail] = useState<CandidateDetail | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }
    fetchHrJobs(hrSession.hr_user_id).then(setJobs).catch(() => setJobs([]));
  }, [hrSession, navigate]);

  useEffect(() => {
    const nextSearch = searchParams.get("search") ?? "";
    const nextStage = (searchParams.get("stage") as StatusView | null) ?? "all";
    const jobParam = searchParams.get("jobId");
    const candidateParam = searchParams.get("candidateId");

    setSearchQuery(nextSearch);
    setStatusView(nextStage);
    setSelectedJobId(jobParam ? Number(jobParam) : "all");
    setSelectedCandidateId(candidateParam ? Number(candidateParam) : null);
  }, [searchParams]);

  async function loadCandidates(query: string) {
    if (!hrSession) {
      return;
    }

    const version = ++requestVersion.current;
    try {
    const data = await searchCandidates(hrSession.hr_user_id, query, {
      jobId: selectedJobId,
    });
    if (version !== requestVersion.current) return;
    setError("");
    setAllCandidates(data);

    const filtered = data.filter((candidate) => candidateMatchesPipelineStage(candidate, statusView));
    setCandidates(filtered);

    const requestedCandidateId = Number(searchParams.get("candidateId") ?? 0);
    setSelectedCandidateId((current) => {
      if (current && filtered.some(candidate => candidate.id === current)) {
        return current;
      }
      if (requestedCandidateId && filtered.some(candidate => candidate.id === requestedCandidateId)) {
        return requestedCandidateId;
      }
      return filtered[0]?.id ?? null;
    });
    } catch (err) { if (version === requestVersion.current) setError(err instanceof Error ? err.message : "Could not load candidates."); }
  }

  useEffect(() => {
    if (!hrSession) {
      return;
    }
    const timeout = window.setTimeout(() => void loadCandidates(deferredSearchQuery), 200);
    return () => { window.clearTimeout(timeout); requestVersion.current += 1; };
  }, [deferredSearchQuery, hrSession, searchParams, selectedJobId, statusView]);

  useEffect(() => {
    if (!selectedCandidateId) {
      setCandidateDetail(null);
      return;
    }
    let active = true;
    setCandidateDetail(null);
    fetchCandidateDetail(selectedCandidateId).then(data => { if (active) setCandidateDetail(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [selectedCandidateId]);

  const counts = useMemo(() => {
    return {
      all: allCandidates.length,
      application_review: allCandidates.filter((candidate) =>
        candidateMatchesPipelineStage(candidate, "application_review"),
      ).length,
      active: allCandidates.filter((candidate) => candidateMatchesPipelineStage(candidate, "active")).length,
      pending_offer: allCandidates.filter((candidate) =>
        candidateMatchesPipelineStage(candidate, "pending_offer"),
      ).length,
      hired: allCandidates.filter((candidate) => candidateMatchesPipelineStage(candidate, "hired")).length,
      archived: allCandidates.filter((candidate) => candidateMatchesPipelineStage(candidate, "archived")).length,
    };
  }, [allCandidates]);

  if (!hrSession) {
    return null;
  }

  const hrReviewerName = hrSession.name;

  async function handleStatusChange(status: CandidateStatus) {
    if (!selectedCandidateId) {
      return;
    }
    await updateCandidateStatus(selectedCandidateId, status);
    await loadCandidates(searchQuery);
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  async function handleSaveNote() {
    if (!selectedCandidateId || !noteValue.trim()) {
      return;
    }
    await addHrNote(selectedCandidateId, hrReviewerName, noteValue.trim());
    setNoteValue("");
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  async function handleExtendDeadline(hours: number | null) {
    if (!selectedCandidateId) {
      return;
    }
    await extendCandidateDeadline(selectedCandidateId, { invite_expiry_hours: hours });
    await loadCandidates(searchQuery);
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Candidates</span>
          <h1>Search and review every candidate record</h1>
        </div>
      </header>

      <div className="search-controls">
        {error ? <p className="status-error" role="alert">{error}</p> : null}
        <div className="status-tab-row">
          {([
            ["all", `All (${counts.all})`],
            ["application_review", `Application Review (${counts.application_review})`],
            ["active", `Active (${counts.active})`],
            ["pending_offer", `Pending Offer (${counts.pending_offer})`],
            ["hired", `Hired (${counts.hired})`],
            ["archived", `Archived (${counts.archived})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={`status-tab ${statusView === key ? "active" : ""}`}
              onClick={() => setStatusView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="search-row">
          <select
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value === "all" ? "all" : Number(event.target.value))}
          >
            <option value="all">All categories</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.category} · {job.title}
              </option>
            ))}
          </select>
          <input
            placeholder="Search by candidate, email, role, token, or resume..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <aside className="dashboard-sidebar">
          <CandidateList
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            onSelect={setSelectedCandidateId}
          />
        </aside>
        <section className="dashboard-detail">
          <CandidateDetailPanel
            candidate={candidateDetail}
            noteValue={noteValue}
            onNoteChange={setNoteValue}
            onSaveNote={handleSaveNote}
            onStatusChange={handleStatusChange}
            onExtendDeadline={handleExtendDeadline}
          />
        </section>
      </div>
    </div>
  );
}
