import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { hrLogin } from "../api/client";
import { setHrSession } from "../utils/session";

export function HrLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const session = await hrLogin(username, password);
      setHrSession(session);
      navigate("/hr/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "HR login failed.");
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-card">
        <div className="section-heading">
          <span className="eyebrow">HR login</span>
          <h1>Open the HR control panel</h1>
        </div>
        <p className="muted-copy">
          Create categories, manually add questions, generate candidate invite links, and search all candidates under your account.
        </p>
        <form className="landing-form" onSubmit={onSubmit}>
          <label>
            Username
            <input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="status-error">{error}</p> : null}
          <button className="primary-button" type="submit">
            Open HR portal
          </button>
        </form>
      </section>
    </div>
  );
}
