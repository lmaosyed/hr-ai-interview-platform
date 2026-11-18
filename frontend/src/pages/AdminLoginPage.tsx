import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { adminLogin } from "../api/client";
import { setAdminSession } from "../utils/session";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const session = await adminLogin(username, password);
      setAdminSession(session);
      navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed.");
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-card">
        <div className="section-heading">
          <span className="eyebrow">Administrator</span>
          <h1>Provision HR accounts</h1>
        </div>
        <p className="muted-copy">
          As admin you can create HR logins and inspect every HR along with the candidates under them.
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
            Open admin page
          </button>
        </form>
      </section>
    </div>
  );
}
