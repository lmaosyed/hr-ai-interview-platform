import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createBulkCandidateInvites,
  createCandidateInvite,
  fetchHrJobs,
} from "../api/client";
import type { CandidateInviteResponse, JobListItem } from "../types/api";
import { getHrSession } from "../utils/session";

type SingleInviteForm = {
  jobId: string;
  name: string;
  email: string;
  password: string;
  inviteExpiryHours: "12" | "24" | "48" | "72" | "none";
};

const emptySingleInviteForm: SingleInviteForm = {
  jobId: "",
  name: "",
  email: "",
  password: "",
  inviteExpiryHours: "24",
};

function getInviteExpiryValue(value: SingleInviteForm["inviteExpiryHours"]) {
  return value === "none" ? null : Number(value);
}

export function HrInvitesPage() {
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [singleInviteForm, setSingleInviteForm] = useState<SingleInviteForm>(emptySingleInviteForm);
  const [bulkText, setBulkText] = useState("");
  const [generatedInvites, setGeneratedInvites] = useState<CandidateInviteResponse[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }
    fetchHrJobs(hrSession.hr_user_id)
      .then((data) => {
        setJobs(data);
        setSingleInviteForm((current) => ({
          ...current,
          jobId: current.jobId || String(data[0]?.id ?? ""),
        }));
      })
      .catch((err) => setError(err.message || "Could not load interview categories."));
  }, [hrSession, navigate]);

  const inviteLinks = useMemo(() => {
    return generatedInvites.map((invite) => ({
      ...invite,
      link: invite.invite_url,
    }));
  }, [generatedInvites]);

  if (!hrSession) {
    return null;
  }

  const hrUserId = hrSession.hr_user_id;

  async function handleSingleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const invite = await createCandidateInvite({
        hr_user_id: hrUserId,
        job_id: Number(singleInviteForm.jobId),
        name: singleInviteForm.name || null,
        email: singleInviteForm.email,
        password: singleInviteForm.password || null,
        invite_expiry_hours: getInviteExpiryValue(singleInviteForm.inviteExpiryHours),
      });
      setGeneratedInvites([invite]);
      setSingleInviteForm((current) => ({
        ...emptySingleInviteForm,
        jobId: current.jobId,
        inviteExpiryHours: current.inviteExpiryHours,
      }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the invite.");
    }
  }

  async function handleBulkInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidates = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email] = line.includes(",") ? line.split(",").map((part) => part.trim()) : ["", line];
        return { name: name || null, email };
      });

    if (!candidates.length) {
      setError("Add at least one email to generate bulk invites.");
      return;
    }

    try {
      const invites = await createBulkCandidateInvites({
        hr_user_id: hrUserId,
        job_id: Number(singleInviteForm.jobId),
        candidates,
        invite_expiry_hours: getInviteExpiryValue(singleInviteForm.inviteExpiryHours),
      });
      setGeneratedInvites(invites);
      setBulkText("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate bulk invites.");
    }
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Invites</span>
          <h1>Generate candidate login links</h1>
        </div>
      </header>

      {error ? <p className="status-error">{error}</p> : null}

      <div className="portal-layout">
        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Single invite</span>
            <h2>Send one candidate at a time</h2>
          </div>
          <form className="form-grid" onSubmit={handleSingleInvite}>
            <label>
              Job template
              <select
                value={singleInviteForm.jobId}
                onChange={(event) => setSingleInviteForm({ ...singleInviteForm, jobId: event.target.value })}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.category} · {job.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Candidate name
              <input
                value={singleInviteForm.name}
                onChange={(event) => setSingleInviteForm({ ...singleInviteForm, name: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                value={singleInviteForm.email}
                onChange={(event) => setSingleInviteForm({ ...singleInviteForm, email: event.target.value })}
              />
            </label>
            <label>
              Password
              <input
                placeholder="Leave blank to auto-generate"
                value={singleInviteForm.password}
                onChange={(event) => setSingleInviteForm({ ...singleInviteForm, password: event.target.value })}
              />
            </label>
            <label>
              Link expiry
              <select
                value={singleInviteForm.inviteExpiryHours}
                onChange={(event) =>
                  setSingleInviteForm({
                    ...singleInviteForm,
                    inviteExpiryHours: event.target.value as SingleInviteForm["inviteExpiryHours"],
                  })
                }
              >
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">72 hours</option>
                <option value="none">No time limit</option>
              </select>
            </label>
            <button className="primary-button" type="submit">
              Generate invite
            </button>
          </form>
        </section>

        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Bulk invite</span>
            <h2>Generate many candidates for one job title</h2>
          </div>
          <p className="muted-copy">
            Each generated invite automatically sends an email to the candidate and uses the expiry window selected
            above.
          </p>
          <form className="form-grid" onSubmit={handleBulkInvite}>
            <label className="full-width">
              Candidate list
              <textarea
                value={bulkText}
                placeholder={"Use one email per line, or name,email per line"}
                onChange={(event) => setBulkText(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit">
              Generate bulk invites
            </button>
          </form>
        </section>

        <section className="chart-card full-width-panel">
          <div className="section-heading compact">
            <span className="eyebrow">Generated links</span>
            <h2>Share these credentials with candidates</h2>
          </div>
          <div className="notes-stack">
            {inviteLinks.map((invite) => (
              <div className="invite-card" key={invite.candidate_id}>
                <p><strong>Name:</strong> {invite.candidate_name}</p>
                <p><strong>Email login:</strong> {invite.login_identifier}</p>
                <p><strong>Password:</strong> {invite.password}</p>
                <p><strong>Category:</strong> {invite.job_category}</p>
                <p>
                  <strong>Expires:</strong>{" "}
                  {invite.invite_expires_at ? new Date(invite.invite_expires_at).toLocaleString() : "No time limit"}
                </p>
                <p>
                  <strong>Email delivery:</strong>{" "}
                  {invite.email_sent ? "Sent" : `Failed${invite.email_error ? ` · ${invite.email_error}` : ""}`}
                </p>
                <p><strong>Link:</strong> <a className="text-link" href={invite.link}>{invite.link}</a></p>
                {invite.mailbox_preview_url ? (
                  <p>
                    <strong>Mailbox preview:</strong>{" "}
                    <a className="text-link" href={invite.mailbox_preview_url} target="_blank" rel="noreferrer">
                      {invite.mailbox_preview_url}
                    </a>
                  </p>
                ) : null}
              </div>
            ))}
            {!inviteLinks.length ? <p className="muted-copy">Generated links will appear here.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
