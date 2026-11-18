import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  PanelsTopLeft,
  Search,
  Users,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";

import { fetchHrJobs, searchCandidates } from "../api/client";
import type { CandidateListItem, JobListItem } from "../types/api";
import { getJobMatchesSearch } from "../utils/pipeline";
import { clearHrSession, getHrSession } from "../utils/session";

const NAV_ITEMS = [
  { to: "/hr/pipeline", label: "Pipeline", icon: PanelsTopLeft },
  { to: "/hr/candidates", label: "Candidates", icon: Users },
  { to: "/hr/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { to: "/hr/reports", label: "Reports", icon: BarChart3 },
  { to: "/hr/dashboards", label: "Dashboards", icon: LayoutDashboard },
];

export function AppShell() {
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [query, setQuery] = useState("");
  const [candidateResults, setCandidateResults] = useState<CandidateListItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    if (!hrSession) {
      setJobs([]);
      return;
    }
    fetchHrJobs(hrSession.hr_user_id).then(data => { if (active) setJobs(data); }).catch(() => {});
    return () => { active = false; };
  }, [hrSession]);

  useEffect(() => {
    let active = true;
    if (!hrSession || query.trim().length < 2) {
      setCandidateResults([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      searchCandidates(hrSession.hr_user_id, query.trim())
        .then((results) => { if (active) setCandidateResults(results.slice(0, 6)); })
        .catch(() => { if (active) setCandidateResults([]); });
    }, 180);

    return () => { active = false; window.clearTimeout(timeout); };
  }, [hrSession, query]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const jobResults = useMemo(() => {
    if (query.trim().length < 2) {
      return [];
    }
    return jobs.filter((job) => getJobMatchesSearch(job, query)).slice(0, 4);
  }, [jobs, query]);

  if (!hrSession) {
    return <Navigate to="/hr/login" replace />;
  }

  const initials = hrSession.name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setSearchOpen(false);
    navigate(`/hr/candidates?search=${encodeURIComponent(query.trim())}`);
  }

  function navigateToCandidate(candidateId: number) {
    setSearchOpen(false);
    navigate(`/hr/candidates?candidateId=${candidateId}&search=${encodeURIComponent(query.trim())}`);
  }

  function navigateToJob(jobId: number) {
    setSearchOpen(false);
    navigate(`/hr/jobs/${jobId}`);
  }

  return (
    <div className="hr-shell">
      <header className="hr-topbar">
        <div className="hr-topbar-left">
          <div className="hr-brand-lockup">
            <span className="shell-brand-kicker">HR AI</span>
            <h1>Interview Review Studio</h1>
          </div>
          <nav className="hr-topnav" aria-label="HR workspace">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink className="top-nav-link" key={item.to} to={item.to}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="hr-topbar-right">
          <div className="global-search" ref={searchRef}>
            <form className="global-search-form" onSubmit={handleSearchSubmit}>
              <Search size={17} />
              <input
                aria-label="Search jobs and candidates"
                placeholder="Search jobs, categories, or candidates"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setSearchOpen(true)}
              />
            </form>

            {searchOpen && query.trim().length >= 2 ? (
              <div className="global-search-results">
                <div className="search-result-group">
                  <div className="search-result-heading">Jobs</div>
                  {jobResults.length ? (
                    jobResults.map((job) => (
                      <button
                        className="search-result-item"
                        key={job.id}
                        onClick={() => navigateToJob(job.id)}
                        type="button"
                      >
                        <strong>{job.title}</strong>
                        <span>
                          {job.category} · {job.candidate_count} candidates
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="search-empty-copy">No job matches yet.</p>
                  )}
                </div>

                <div className="search-result-group">
                  <div className="search-result-heading">Candidates</div>
                  {candidateResults.length ? (
                    candidateResults.map((candidate) => (
                      <button
                        className="search-result-item"
                        key={candidate.id}
                        onClick={() => navigateToCandidate(candidate.id)}
                        type="button"
                      >
                        <strong>{candidate.name}</strong>
                        <span>
                          {candidate.job_category ?? "Candidate"} · {candidate.email}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="search-empty-copy">No candidate matches yet.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="profile-menu" ref={profileRef}>
            <button
              className="profile-menu-trigger"
              onClick={() => setProfileOpen((current) => !current)}
              type="button"
            >
              <span className="profile-avatar">{initials}</span>
              <span className="profile-copy">
                <strong>{hrSession.name}</strong>
                <small>{hrSession.username}</small>
              </span>
              <ChevronDown size={16} />
            </button>

            {profileOpen ? (
              <div className="profile-menu-panel">
                <div className="profile-card">
                  <span className="eyebrow">Profile</span>
                  <strong>{hrSession.name}</strong>
                  <p>{hrSession.email}</p>
                  <p>@{hrSession.username}</p>
                </div>
                <button
                  className="secondary-button profile-logout-button"
                  onClick={() => {
                    clearHrSession();
                    window.location.href = "/";
                  }}
                  type="button"
                >
                  <LogOut size={16} />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="hr-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
