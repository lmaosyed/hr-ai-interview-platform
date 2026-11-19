import { BriefcaseBusiness, Mic, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="welcome-page">
      <header className="welcome-topbar">
        <Link className="studio-wordmark" to="/" aria-label="HR AI home"><span className="brand-mark"><Mic size={19} /></span>HR AI<span className="wordmark-divider">/</span><span className="wordmark-caption">Interview studio</span></Link>
        <span className="welcome-edition">Version 1.0 · Local-first</span>
      </header>
      <main className="welcome-main">
        <div className="welcome-intro">
          <span className="eyebrow">A little less scheduling. A lot more clarity.</span>
          <h1>Better interviews.<br /><span>Thoughtful decisions.</span></h1>
          <p>Record on your own time. Review the answers, not just a score. A focused workspace for candidates and the people hiring them.</p>
        </div>
        <div className="welcome-paths">
          <Link className="welcome-path" to="/candidate-login">
            <span className="path-icon"><Users size={25} /></span>
            <h2>Here for an interview?</h2>
            <p>Sign in with your invitation, choose your role, and answer directly in your browser.</p>
            <span className="path-action">Candidate sign in</span>
          </Link>
          <Link className="welcome-path" to="/hr/login">
            <span className="path-icon"><BriefcaseBusiness size={25} /></span>
            <h2>Building your team?</h2>
            <p>Set up questions, invite applicants, and review recordings with content-based analysis.</p>
            <span className="path-action">Recruiter sign in</span>
          </Link>
        </div>
        <footer className="welcome-footer"><span>Recorded here. Reviewed by people.</span><span>AI supports the review. You make the decision.</span></footer>
      </main>
    </div>
  );
}
