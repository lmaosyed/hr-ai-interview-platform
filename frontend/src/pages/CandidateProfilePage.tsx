import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getAssetUrl, updateCandidateProfile } from "../api/client";
import {
  clearCandidateSession,
  didPageReload,
  getCandidateSession,
  setCandidateSession,
} from "../utils/session";

type ProfileErrors = {
  name?: string;
  currentRole?: string;
  yearsExperience?: string;
  resume?: string;
};

export function CandidateProfilePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(getCandidateSession());
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileForm, setProfileForm] = useState({
    name: session?.name ?? "",
    currentRole: session?.current_role ?? "",
    yearsExperience: session?.years_experience != null ? String(session.years_experience) : "",
    resume: null as File | null,
  });

  useEffect(() => {
    if (didPageReload()) {
      clearCandidateSession();
      navigate("/candidate-login", { replace: true });
      return;
    }

    if (!session) {
      navigate("/candidate-login", { replace: true });
    }
  }, [navigate, session]);

  const firstName = useMemo(() => session?.name.split(" ")[0] ?? "Candidate", [session]);

  if (!session) {
    return null;
  }

  const candidateSession = session;

  function validateProfile() {
    const nextErrors: ProfileErrors = {};
    if (!profileForm.name.trim()) {
      nextErrors.name = "You should enter your full name.";
    }
    if (!profileForm.currentRole.trim()) {
      nextErrors.currentRole = "You should enter your current role or course.";
    }
    if (!profileForm.yearsExperience.trim()) {
      nextErrors.yearsExperience = "Years of experience is missing.";
    } else if (Number.isNaN(Number(profileForm.yearsExperience))) {
      nextErrors.yearsExperience = "Years of experience should be a valid number.";
    }
    if (!candidateSession.resume_url && !profileForm.resume) {
      nextErrors.resume = "Resume is missing. Upload it before continuing.";
    }
    setProfileErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateProfile()) {
      setError("You should complete every required profile detail before continuing.");
      return;
    }

    const formData = new FormData();
    formData.append("identifier", candidateSession.username);
    formData.append("password", candidateSession.login_password ?? "");
    formData.append("name", profileForm.name.trim());
    formData.append("current_role", profileForm.currentRole.trim());
    formData.append("years_experience", profileForm.yearsExperience.trim());
    if (profileForm.resume) {
      formData.append("resume", profileForm.resume);
    }

    try {
      const updatedSession = await updateCandidateProfile(formData);
      const hydratedSession = { ...updatedSession, login_password: candidateSession.login_password };
      setCandidateSession(hydratedSession);
      setSession(hydratedSession);
      setEditing(false);
      setError("");
      setProfileErrors({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details.");
    }
  }

  return (
    <div className="dashboard-layout candidate-portal-layout">
      <header className="candidate-topbar">
        <button className="secondary-button" onClick={() => navigate("/candidate/home")}>
          <ArrowLeft size={18} />
          Back to interviews
        </button>
        <div className="candidate-topbar-actions">
          <button
            className="secondary-button"
            onClick={() => {
              clearCandidateSession();
              navigate("/", { replace: true });
            }}
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </header>

      <section className="candidate-hero-card">
        <div className="candidate-avatar-large">
          <UserRound size={34} />
        </div>
        <div>
          <span className="eyebrow">Candidate profile</span>
          <h1>Hello {firstName}</h1>
          <p className="muted-copy">
            Review the details that HR teams can see before or after your interview.
          </p>
        </div>
      </section>

      <div className="candidate-profile-grid">
        <section className="chart-card candidate-home-card">
          <div className="section-heading compact">
            <span className="eyebrow">Your details</span>
            <h2>Profile summary</h2>
          </div>
          <div className="notes-stack">
            <div className="note-card">
              <strong>{candidateSession.name}</strong>
              <p>{candidateSession.current_role}</p>
              <p>{candidateSession.email}</p>
              <p>{candidateSession.years_experience ?? 0} years of experience</p>
              {candidateSession.resume_url ? (
                <a className="text-link" href={getAssetUrl(candidateSession.resume_url)} target="_blank" rel="noreferrer">
                  View stored resume
                </a>
              ) : (
                <p className="muted-copy">No resume uploaded yet.</p>
              )}
            </div>
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={() => setEditing((current) => !current)}>
              {editing ? "Close editor" : "Edit profile"}
            </button>
          </div>
        </section>

        {editing ? (
          <section className="chart-card candidate-home-card">
            <div className="section-heading compact">
              <span className="eyebrow">Edit</span>
              <h2>Update your details</h2>
            </div>
            <form className="form-grid" onSubmit={handleProfileSubmit}>
              <label>
                Full name
                <input
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
                {profileErrors.name ? <span className="field-error">{profileErrors.name}</span> : null}
              </label>
              <label>
                Current title or course
                <input
                  value={profileForm.currentRole}
                  onChange={(event) => setProfileForm((current) => ({ ...current, currentRole: event.target.value }))}
                />
                {profileErrors.currentRole ? <span className="field-error">{profileErrors.currentRole}</span> : null}
              </label>
              <label>
                Years of experience
                <input
                  value={profileForm.yearsExperience}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, yearsExperience: event.target.value }))
                  }
                />
                {profileErrors.yearsExperience ? (
                  <span className="field-error">{profileErrors.yearsExperience}</span>
                ) : null}
              </label>
              <label>
                Resume
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      resume: event.target.files?.[0] ?? null,
                    }))
                  }
                />
                {profileErrors.resume ? <span className="field-error">{profileErrors.resume}</span> : null}
              </label>
              {error ? <p className="status-error full-width">{error}</p> : null}
              <div className="button-row full-width">
                <button className="primary-button" type="submit">
                  Save profile
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
