import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  addHrNote,
  extendCandidateDeadline,
  fetchCandidateDetail,
  fetchJobCandidates,
  updateCandidateStatus,
} from "../api/client";
import { CandidateDetailPanel } from "../components/CandidateDetailPanel";
import { CandidateList } from "../components/CandidateList";
import type { CandidateDetail, CandidateListItem, CandidateStatus } from "../types/api";
import { getHrSession } from "../utils/session";

export function HrJobPage() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const numericJobId = Number(jobId ?? 1);
  const [hrSession] = useState(() => getHrSession());

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [candidateDetail, setCandidateDetail] = useState<CandidateDetail | null>(null);
  const [noteValue, setNoteValue] = useState("");

  async function loadCandidates() {
    const data = await fetchJobCandidates(numericJobId);
    setCandidates(data);
    const requestedCandidateId = Number(searchParams.get("candidateId") ?? 0);
    setSelectedCandidateId((current) => {
      if (current && data.some(candidate => candidate.id === current)) {
        return current;
      }
      if (requestedCandidateId && data.some(candidate => candidate.id === requestedCandidateId)) {
        return requestedCandidateId;
      }
      return data[0]?.id ?? null;
    });
  }

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }
    void loadCandidates().catch(() => setCandidates([]));
  }, [numericJobId, navigate]);

  useEffect(() => {
    if (!selectedCandidateId) {
      setCandidateDetail(null);
      return;
    }
    let active = true;
    setCandidateDetail(null);
    fetchCandidateDetail(selectedCandidateId).then(data => { if (active) setCandidateDetail(data); }).catch(() => { if (active) setCandidateDetail(null); });
    return () => { active = false; };
  }, [selectedCandidateId]);

  async function handleStatusChange(status: CandidateStatus) {
    if (!selectedCandidateId) {
      return;
    }
    await updateCandidateStatus(selectedCandidateId, status);
    await loadCandidates();
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  async function handleSaveNote() {
    if (!selectedCandidateId || !noteValue.trim()) {
      return;
    }
    await addHrNote(selectedCandidateId, hrSession?.name ?? "HR reviewer", noteValue.trim());
    setNoteValue("");
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  async function handleExtendDeadline(hours: number | null) {
    if (!selectedCandidateId) {
      return;
    }
    await extendCandidateDeadline(selectedCandidateId, { invite_expiry_hours: hours });
    await loadCandidates();
    const detail = await fetchCandidateDetail(selectedCandidateId);
    setCandidateDetail(detail);
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Applicant review</span>
          <h1>Async interview candidate board</h1>
        </div>
        <p className="muted-copy">
          Review candidate evidence, understand why scores were assigned, and move decisions
          forward without leaving the page.
        </p>
      </header>

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
