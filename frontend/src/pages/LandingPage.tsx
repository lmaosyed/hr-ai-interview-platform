import { ArrowRight, BarChart3, Eye, FlaskConical, Shield, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="landing-shell">
      <section className="landing-centered-hero">
        <span className="hero-pill">
          <Sparkles size={16} />
          AI-assisted hiring
        </span>
        <h1>
          Interviews that work
          <span>while you sleep.</span>
        </h1>
        <p>
          Candidates record proctored async interviews from any browser. Your team reviews ranked,
          transcribed, and explained results without starting from zero.
        </p>
      </section>

      <section className="landing-entry-grid landing-entry-grid-wide">
        <Link className="landing-entry-card" to="/candidate-login">
          <div className="landing-entry-icon candidate">
            <Users size={22} />
          </div>
          <strong>I&apos;m a candidate</strong>
          <p>Take your invited interview from this browser.</p>
          <span className="landing-entry-link">
            Continue
            <ArrowRight size={16} />
          </span>
        </Link>

        <Link className="landing-entry-card" to="/hr/login">
          <div className="landing-entry-icon recruiter">
            <Shield size={22} />
          </div>
          <strong>I&apos;m a recruiter</strong>
          <p>Create roles, invite candidates, and review interviews with analytics.</p>
          <span className="landing-entry-link">
            Open dashboard
            <ArrowRight size={16} />
          </span>
        </Link>

        <Link className="landing-entry-card" to="/evaluation-lab">
          <div className="landing-entry-icon candidate">
            <FlaskConical size={22} />
          </div>
          <strong>AI evaluation lab</strong>
          <p>Continuously test the current interview scoring behavior on fresh recordings.</p>
          <span className="landing-entry-link">
            Open practice route
            <ArrowRight size={16} />
          </span>
        </Link>
      </section>

      <section className="landing-feature-grid">
        <article className="landing-feature-card">
          <Eye size={22} />
          <strong>Live proctoring</strong>
          <p>Camera, microphone, screen-share, tab-switch, and fullscreen monitoring in one flow.</p>
        </article>
        <article className="landing-feature-card">
          <Shield size={22} />
          <strong>Explainable signals</strong>
          <p>Every score is paired with reasoning so reviewers can understand what the system saw.</p>
        </article>
        <article className="landing-feature-card">
          <BarChart3 size={22} />
          <strong>Reviewer-first analytics</strong>
          <p>Confidence trends, integrity events, and job-level dashboards for HR teams.</p>
        </article>
      </section>
    </div>
  );
}
