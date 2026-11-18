import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { fetchHrJobs, fetchJobAnalytics } from "../api/client";
import { AnalyticsCharts } from "../components/AnalyticsCharts";
import type { JobAnalytics, JobListItem } from "../types/api";
import { getHrSession } from "../utils/session";

export function HrAnalyticsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(jobId ? Number(jobId) : null);
  const [analytics, setAnalytics] = useState<JobAnalytics | null>(null);

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }

    fetchHrJobs(hrSession.hr_user_id)
      .then((data) => {
        setJobs(data);
        setSelectedJobId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => setJobs([]));
  }, [hrSession, navigate]);

  useEffect(() => {
    if (!selectedJobId) {
      setAnalytics(null);
      return;
    }
    let active = true;
    setAnalytics(null);
    fetchJobAnalytics(selectedJobId).then(data => { if (active) setAnalytics(data); }).catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [selectedJobId]);

  if (!hrSession) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>Hiring reports by job and category</h1>
        </div>
      </header>

      <section className="chart-card">
        <div className="search-row">
          <select value={selectedJobId ?? ""} onChange={(event) => setSelectedJobId(Number(event.target.value))}>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.category} · {job.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
