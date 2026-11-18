import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { candidateLogin } from "../api/client";
import { setCandidateSession } from "../utils/session";

export function CandidateLoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState(searchParams.get("login") ?? searchParams.get("username") ?? "");
  const [password, setPassword] = useState(searchParams.get("password") ?? "");
  const [error, setError] = useState("");

  const inviteToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const session = await candidateLogin(username, password);
      setCandidateSession({ ...session, login_password: password });
      navigate(inviteToken ? `/candidate/home?token=${encodeURIComponent(inviteToken)}` : "/candidate/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Candidate login failed.");
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-card auth-card-dark candidate-auth-card">
        <div className="section-heading">
          <span className="eyebrow">Candidate login</span>
          <h1>Candidate sign in</h1>
        </div>
        <p className="muted-copy">
          Use the credentials sent to your email. The interview will be conducted directly on this website.
        </p>
        <form className="landing-form" onSubmit={onSubmit}>
          <label>
            Email or username
            <input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {inviteToken ? <p className="muted-copy">Invite token detected from the shared HR link.</p> : null}
          {error ? <p className="status-error">{error}</p> : null}
          <button className="primary-button" type="submit">
            Continue
          </button>
        </form>
      </section>
    </div>
  );
}
