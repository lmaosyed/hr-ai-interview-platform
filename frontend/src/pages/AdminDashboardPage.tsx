import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createHrUser, fetchAdminDashboard } from "../api/client";
import { AdminSetupPanel } from "../components/AdminSetupPanel";
import type { AdminDashboard } from "../types/api";
import { clearAdminSession, getAdminSession } from "../utils/session";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminSession] = useState(() => getAdminSession());
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
  });

  async function loadDashboard() {
    const data = await fetchAdminDashboard();
    setDashboard(data);
  }

  useEffect(() => {
    if (!adminSession) {
      navigate("/admin/login");
      return;
    }
    loadDashboard().catch((err) => setError(err.message || "Could not load admin dashboard."));
  }, [adminSession, navigate]);

  if (!adminSession) {
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      await createHrUser(form);
      setForm({ name: "", email: "", username: "", password: "" });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create HR account.");
    } finally { setSaving(false); }
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Administrator</span>
          <h1>Platform control room</h1>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            clearAdminSession();
            navigate("/");
          }}
        >
          Log out
        </button>
      </header>

      {error ? <p className="status-error">{error}</p> : null}

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total HRs</span>
          <strong>{dashboard?.metrics.total_hrs ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Active HRs</span>
          <strong>{dashboard?.metrics.active_hrs ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Templates</span>
          <strong>{dashboard?.metrics.total_templates ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Pending decisions</span>
          <strong>{dashboard?.metrics.pending_decisions ?? 0}</strong>
        </div>
      </section>

      <AdminSetupPanel />
      <div className="portal-layout admin-layout">
        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Provisioning</span>
            <h2>Add an HR account</h2>
          </div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              HR name
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              Username
              <input required autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            </label>
            <label>
              Password
              <input required minLength={6} autoComplete="new-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Creating HR account..." : "Create HR login"}
            </button>
          </form>
        </section>

        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Directories</span>
            <h2>Open the detailed management pages</h2>
          </div>
          <div className="portal-card-grid">
            <Link className="portal-card" to="/admin/hrs">
              <div>
                <strong>View all HRs</strong>
                <p>Search, suspend, delete, and expand each HR to review the candidates under them.</p>
              </div>
            </Link>
            <Link className="portal-card" to="/admin/candidates">
              <div>
                <strong>View all candidates</strong>
                <p>Search every candidate on the platform with the owning HR and job category shown row by row.</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
