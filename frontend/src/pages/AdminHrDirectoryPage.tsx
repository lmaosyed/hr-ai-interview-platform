import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deleteHrUser, fetchAdminDashboard, updateHrUserStatus } from "../api/client";
import type { AdminDashboard } from "../types/api";
import { getAdminSession } from "../utils/session";

function accountAgeLabel(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const days = Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)));
  return days === 0 ? "Created today" : `${days} day${days === 1 ? "" : "s"} ago`;
}

export function AdminHrDirectoryPage() {
  const navigate = useNavigate();
  const [adminSession] = useState(() => getAdminSession());
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function loadDashboard() {
    const data = await fetchAdminDashboard();
    setDashboard(data);
  }

  useEffect(() => {
    if (!adminSession) {
      navigate("/admin/login");
      return;
    }
    loadDashboard().catch((err) => setError(err.message || "Could not load HR directory."));
  }, [adminSession, navigate]);

  const filteredHrUsers = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!dashboard || !lowered) {
      return dashboard?.hr_users ?? [];
    }
    return dashboard.hr_users.filter((hrUser) => {
      const hrMatch =
        hrUser.name.toLowerCase().includes(lowered) ||
        hrUser.email.toLowerCase().includes(lowered) ||
        hrUser.username.toLowerCase().includes(lowered);
      const candidateMatch = hrUser.candidates.some(
        (candidate) =>
          candidate.name.toLowerCase().includes(lowered) ||
          candidate.email.toLowerCase().includes(lowered) ||
          candidate.job_category.toLowerCase().includes(lowered),
      );
      return hrMatch || candidateMatch;
    });
  }, [dashboard, query]);

  if (!adminSession) {
    return null;
  }

  async function toggleStatus(hrUserId: number, nextValue: boolean) {
    try {
    await updateHrUserStatus(hrUserId, { is_active: nextValue });
    await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not change account status."); }
  }

  async function removeHr(hrUserId: number) {
    if (!window.confirm("Delete this HR account and its candidate records? This cannot be undone.")) return;
    try {
    await deleteHrUser(hrUserId);
    await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete account."); }
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Administrator</span>
          <h1>HR directory</h1>
        </div>
        <Link className="text-link" to="/admin">
          Back to dashboard
        </Link>
      </header>

      {error ? <p className="status-error">{error}</p> : null}

      <section className="chart-card">
        <div className="search-row">
          <input
            placeholder="Search HRs, emails, usernames, or candidates..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="directory-list">
          {filteredHrUsers.map((hrUser) => (
            <details className="directory-row" key={hrUser.id}>
              <summary>
                <div>
                  <strong>{hrUser.name}</strong>
                  <p>{hrUser.email} · {hrUser.username}</p>
                </div>
                <div className="directory-meta">
                  <span className={`mini-tag ${hrUser.is_active ? "status-active" : "status-paused"}`}>
                    {hrUser.is_active ? "Active" : "Suspended"}
                  </span>
                  <span>{hrUser.job_count} templates</span>
                  <span>{hrUser.candidate_count} candidates</span>
                  <span>{accountAgeLabel(hrUser.created_at)}</span>
                </div>
              </summary>
              <div className="directory-actions">
                <button
                  className="secondary-button small"
                  onClick={() => void toggleStatus(hrUser.id, !hrUser.is_active)}
                >
                  {hrUser.is_active ? "Temporary suspend" : "Reactivate"}
                </button>
                <button className="secondary-button small danger-button" onClick={() => void removeHr(hrUser.id)}>
                  Delete credentials
                </button>
              </div>
              <div className="notes-stack">
                {hrUser.candidates.map((candidate) => (
                  <div className="timeline-item" key={candidate.id}>
                    <strong>{candidate.name}</strong>
                    <span>
                      {candidate.email} · {candidate.job_category} · {candidate.status}
                    </span>
                  </div>
                ))}
                {!hrUser.candidates.length ? (
                  <p className="muted-copy">No candidates are assigned to this HR yet.</p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
