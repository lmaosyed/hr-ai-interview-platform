import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { requestCandidateDeadlineExtension, updateCandidateProfile } from "../api/client";
import type { CandidateApplicationSummary } from "../types/api";
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

export function CandidateHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(getCandidateSession());
  const [error, setError] = useState("");
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [selectedApplication, setSelectedApplication] = useState<CandidateApplicationSummary | null>(null);
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionMessage, setExtensionMessage] = useState("");
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
      return;
    }

    const token = searchParams.get("token");
    if (!token || !session.profile_completed) {
      return;
    }

    const matched = session.applications.find((application) => application.interview_token === token);
    if (matched) {
      setSelectedApplication(matched);
    }
  }, [navigate, searchParams, session]);

  const firstName = useMemo(() => session?.name.split(" ")[0] ?? "Candidate", [session]);
  const selectedInviteExpiryLabel = useMemo(() => {
    if (!selectedApplication?.invite_expires_at) {
      return "No expiry";
    }
    return new Date(selectedApplication.invite_expires_at).toLocaleString();
  }, [selectedApplication]);

  if (!session) {
    return null;
  }

  const candidateSession = session;
  const availableInterviews = candidateSession.applications.filter(
    (application) => application.status === "pending" && !application.invite_expired,
  );
  const completedInterviews = candidateSession.applications.filter(
    (application) => application.status !== "pending" || application.invite_expired,
  );

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
      setError("");
      setProfileErrors({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details.");
    }
  }

  function openInterview(application: CandidateApplicationSummary) {
    setSelectedApplication(application);
    setExtensionReason(application.deadline_extension_reason ?? "");
    setExtensionMessage("");
  }

  function continueToInterview() {
    if (
      !selectedApplication ||
      selectedApplication.status !== "pending" ||
      selectedApplication.invite_expired
    ) {
      return;
    }
    navigate(`/interview/${selectedApplication.interview_token}`);
  }

  async function handleExtensionRequest() {
    if (!selectedApplication || !extensionReason.trim()) {
      setExtensionMessage("Tell the HR team why you need more time before sending the request.");
      return;
    }
    try {
      await requestCandidateDeadlineExtension({
        identifier: candidateSession.username,
        password: candidateSession.login_password ?? "",
        candidate_id: selectedApplication.candidate_id,
        reason: extensionReason.trim(),
      });
      const updatedApplications = candidateSession.applications.map((application) =>
        application.candidate_id === selectedApplication.candidate_id
          ? {
              ...application,
              deadline_extension_requested_at: new Date().toISOString(),
              deadline_extension_reason: extensionReason.trim(),
            }
          : application,
      );
      const updatedSession = {
        ...candidateSession,
        applications: updatedApplications,
      };
      setCandidateSession(updatedSession);
      setSession(updatedSession);
      setSelectedApplication(
        updatedApplications.find((application) => application.candidate_id === selectedApplication.candidate_id) ?? null,
      );
      setExtensionMessage("Your deadline extension request has been sent to HR.");
    } catch (err) {
      setExtensionMessage(err instanceof Error ? err.message : "Could not send the extension request.");
    }
  }

  return (
    <div className="dashboard-layout candidate-portal-layout">
      <header className="candidate-topbar">
        <div className="candidate-topbar-brand">
          <span className="eyebrow">Candidate session</span>
          <h1>Hello {firstName}</h1>
        </div>
        <div className="candidate-topbar-actions">
          <button className="profile-icon-button" onClick={() => navigate("/candidate/profile")}>
            <UserRound size={18} />
          </button>
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

      {!candidateSession.profile_completed ? (
        <section className="chart-card candidate-home-card">
          <div className="section-heading compact">
            <span className="eyebrow">First-time setup</span>
            <h2>Complete your profile before continuing</h2>
          </div>
          <p className="muted-copy">
            Your details and resume will be visible to the HR teams who invited you.
          </p>
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
      ) : (
        <>
          <section className="candidate-hero-card">
            <div>
              <span className="eyebrow">Ready to continue</span>
              <h2>Pick the interview you want to take next</h2>
            </div>
            <p className="muted-copy">
              Every interview below launches from this website and requires camera, microphone, entire-screen sharing,
              and fullscreen mode.
            </p>
          </section>

          <section className="chart-card candidate-home-card">
            <div className="section-heading compact">
              <span className="eyebrow">Available interviews</span>
              <h2>Your pending roles</h2>
            </div>
            <div className="candidate-job-grid">
              {availableInterviews.map((application) => (
                <button
                  className="candidate-job-card candidate-job-box"
                  key={application.candidate_id}
                  onClick={() => openInterview(application)}
                >
                  <span className="mini-tag">{application.job_category}</span>
                  <strong>{application.job_title}</strong>
                  <p>{application.hr_name}</p>
                  <p className="muted-copy">
                    Invited on {new Date(application.applied_at).toLocaleDateString()}
                  </p>
                  <p className="muted-copy">
                    {application.invite_expires_at
                      ? `Expires ${new Date(application.invite_expires_at).toLocaleString()}`
                      : "No invite expiry"}
                  </p>
                  <span className="candidate-job-cta">
                    Open interview
                    <ArrowRight size={16} />
                  </span>
                </button>
              ))}
              {!availableInterviews.length ? (
                <div className="note-card">
                  <strong>No pending interviews</strong>
                  <p className="muted-copy">
                    Any submitted or reviewed interviews will appear in the completed section below.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="chart-card candidate-home-card">
            <div className="section-heading compact">
              <span className="eyebrow">Completed interviews</span>
              <h2>Track your submitted roles</h2>
            </div>
            <div className="candidate-job-grid">
              {completedInterviews.map((application) => (
                <div className="candidate-job-card static" key={application.candidate_id}>
                  <span className="mini-tag">
                    {application.deadline_extension_requested_at
                      ? "extension requested"
                      : application.invite_expired
                        ? "expired"
                        : application.status}
                  </span>
                  <strong>{application.job_title}</strong>
                  <p>{application.hr_name}</p>
                  <p className="muted-copy">{application.job_category}</p>
                  <p className="muted-copy">
                    {application.invite_expired && application.invite_expires_at
                      ? `Expired ${new Date(application.invite_expires_at).toLocaleString()}`
                      : `Updated ${new Date(application.applied_at).toLocaleDateString()}`}
                  </p>
                </div>
              ))}
              {!completedInterviews.length ? (
                <div className="note-card">
                  <strong>No completed interviews yet</strong>
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}

      {selectedApplication ? (
        <div className="modal-overlay" role="presentation" onClick={() => setSelectedApplication(null)}>
          <section className="modal-card interview-launch-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading compact">
              <span className="eyebrow">Interview overview</span>
              <h2>{selectedApplication.job_title}</h2>
            </div>
            <div className="tag-row">
              <span className="mini-tag">{selectedApplication.job_category}</span>
              <span className="mini-tag">{selectedApplication.hr_name}</span>
              <span className="mini-tag">
                {selectedApplication.invite_expired ? "expired" : selectedApplication.status}
              </span>
            </div>
            <p className="muted-copy">{selectedApplication.job_description}</p>
            <div className="modal-overview-grid">
              <div className="note-card">
                <strong>Interview details</strong>
                <p>Invite date: {new Date(selectedApplication.applied_at).toLocaleDateString()}</p>
                <p>Invite expiry: {selectedInviteExpiryLabel}</p>
                <p>Recording happens directly on this website.</p>
                <p>Once you submit, this interview cannot be retaken.</p>
              </div>
              <div className="note-card">
                <strong>How the interview is conducted</strong>
                <p>Allow camera and microphone when prompted.</p>
                <p>Share your entire screen, not a window or tab.</p>
                <p>The interview automatically moves into fullscreen once permissions are granted.</p>
              </div>
            </div>
            <div className="proctor-notice">
              <strong>
                <ShieldCheck size={18} />
                This is a proctored interview.
              </strong>
              <p>
                Tab switches, copy-paste activity, fullscreen exits, and screen-share interruptions are recorded.
              </p>
            </div>
            {selectedApplication.invite_expires_at ? (
              <div className="note-card">
                <strong>Need more time?</strong>
                <p className="muted-copy">
                  If you cannot complete the interview before the deadline, send HR a quick extension request here.
                </p>
                <textarea
                  value={extensionReason}
                  placeholder="Explain why you need more time."
                  onChange={(event) => setExtensionReason(event.target.value)}
                />
                {selectedApplication.deadline_extension_requested_at ? (
                  <p className="muted-copy">
                    Request sent {new Date(selectedApplication.deadline_extension_requested_at).toLocaleString()}
                  </p>
                ) : null}
                {extensionMessage ? <p className="muted-copy">{extensionMessage}</p> : null}
                <div className="button-row">
                  <button className="secondary-button" onClick={() => void handleExtensionRequest()}>
                    Request deadline extension
                  </button>
                </div>
              </div>
            ) : null}
            <div className="button-row">
              <button
                className="primary-button"
                disabled={selectedApplication.status !== "pending" || Boolean(selectedApplication.invite_expired)}
                onClick={continueToInterview}
              >
                {selectedApplication.invite_expired ? "Invite expired" : "Continue to permissions"}
              </button>
              <button className="secondary-button" onClick={() => setSelectedApplication(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
