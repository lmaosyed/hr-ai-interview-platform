import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { fetchAdminDashboard } from "../api/client";
import type { AdminCandidateSummary, AdminDashboard } from "../types/api";
import { getAdminSession } from "../utils/session";

type DirectoryCandidate = AdminCandidateSummary & {
  hrName: string;
  hrEmail: string;
};

export function AdminCandidateDirectoryPage() {
  const navigate = useNavigate();
  const [adminSession] = useState(() => getAdminSession());
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminSession) {
      navigate("/admin/login");
      return;
    }
    fetchAdminDashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message || "Could not load candidate directory."));
  }, [adminSession, navigate]);

  const candidates = useMemo(() => {
    const flatList: DirectoryCandidate[] = [];
    for (const hrUser of dashboard?.hr_users ?? []) {
      for (const candidate of hrUser.candidates) {
        flatList.push({
          ...candidate,
          hrName: hrUser.name,
          hrEmail: hrUser.email,
        });
      }
    }
    const lowered = query.trim().toLowerCase();
    if (!lowered) {
      return flatList;
    }
    return flatList.filter((candidate) =>
      [
        candidate.name,
        candidate.email,
        candidate.username,
        candidate.job_title,
        candidate.job_category,
        candidate.hrName,
        candidate.hrEmail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(lowered),
    );
  }, [dashboard, query]);

  if (!adminSession) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Administrator</span>
          <h1>Candidate directory</h1>
        </div>
        <Link className="text-link" to="/admin">
          Back to dashboard
        </Link>
      </header>

      {error ? <p className="status-error">{error}</p> : null}

      <section className="chart-card">
        <div className="search-row">
          <input
            placeholder="Search by candidate, HR, email, role, or category..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="directory-list">
          {candidates.map((candidate) => (
            <div className="directory-row flat" key={`${candidate.id}-${candidate.job_title}`}>
              <div>
                <strong>{candidate.name}</strong>
                <p>{candidate.email} · {candidate.job_title}</p>
              </div>
              <div className="directory-meta">
                <span>{candidate.job_category}</span>
                <span>{candidate.status}</span>
                <span>{candidate.hrName}</span>
                <span>{new Date(candidate.applied_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
