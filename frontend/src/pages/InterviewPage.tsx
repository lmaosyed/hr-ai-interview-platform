import { LoaderCircle, Monitor, ShieldCheck, TimerReset, Webcam, Mic } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useInterviewSession } from "../hooks/useInterviewSession";
import { clearCandidateSession, didPageReload, getCandidateSession } from "../utils/session";

export function InterviewPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const candidateSession = getCandidateSession();

  const {
    context,
    phase,
    deviceStatus,
    currentQuestion,
    currentQuestionIndex,
    secondsRemaining,
    processingStatus,
    sessionId,
    error,
    proctorWarning,
    fullscreenRequired,
    questionStage,
    thinkingSecondsRemaining,
    typedAnswers,
    webcamVideoRef,
    startInterview,
    endInterview,
    nextQuestion,
    updateTypedAnswer,
    resumeFullscreen,
    skipThinkingTime,
    retryUpload,
    canRetryUpload,
  } = useInterviewSession(token);

  useEffect(() => {
    if (didPageReload()) {
      clearCandidateSession();
      navigate("/candidate-login", { replace: true });
      return;
    }
    if (!candidateSession) {
      navigate("/candidate-login", { replace: true });
    }
  }, [candidateSession, navigate]);

  const progressLabel = useMemo(() => {
    if (!context) {
      return "";
    }
    return `Question ${currentQuestionIndex + 1} of ${context.questions.length}`;
  }, [context, currentQuestionIndex]);

  if (!candidateSession) {
    return null;
  }

  return (
    <div className="interview-layout dark-interview-layout">
      {proctorWarning ? <div className="proctor-banner">{proctorWarning}</div> : null}

      <section className="interview-hero interview-hero-dark">
        <span className="eyebrow">Candidate session</span>
        <h1>{context ? `Hello ${context.candidate_name}` : "Preparing interview..."}</h1>
        <p>{context?.job_title ?? "Loading your interview instructions."}</p>
        <p className="muted-copy">{context?.job_description ?? "Loading your interview instructions."}</p>
      </section>

      <div className="interview-grid">
        <div className="interview-panel">
          {fullscreenRequired ? (
            <section className="interview-card rule-warning-card">
              <h2>Fullscreen mode is required</h2>
              <p className="muted-copy">
                Return to fullscreen before continuing. The interview timer is paused until you do.
              </p>
              <button className="primary-button" onClick={() => void resumeFullscreen()}>
                Return to fullscreen
              </button>
            </section>
          ) : null}

          {phase === "ready" ? (
            <section className="interview-card interview-start-card">
              <div className="section-heading compact">
                <span className="eyebrow">Step 1</span>
                <h2>Allow permissions and begin</h2>
              </div>
              <p className="muted-copy">
                When you continue, your browser will ask for camera, microphone, and entire-screen sharing. Once all
                permissions are accepted, the website will move into fullscreen automatically.
              </p>
              <div className="permission-chip-row">
                <div className={`permission-chip ${deviceStatus.webcam ? "success" : ""}`}>
                  <Webcam size={18} />
                  <span>Camera</span>
                </div>
                <div className={`permission-chip ${deviceStatus.mic ? "success" : ""}`}>
                  <Mic size={18} />
                  <span>Microphone</span>
                </div>
                <div className={`permission-chip ${deviceStatus.screen ? "success" : ""}`}>
                  <Monitor size={18} />
                  <span>Entire screen</span>
                </div>
              </div>
              <div className="proctor-notice">
                <strong>
                  <ShieldCheck size={18} />
                  Interview rules
                </strong>
                <p>Share the full screen, stay on this tab, and keep fullscreen enabled during the interview.</p>
              </div>
              {error ? <p className="status-error">{error}</p> : null}
              <div className="button-row">
                <button className="primary-button" onClick={() => void startInterview()}>
                  Allow permissions and start
                </button>
                <button className="secondary-button" onClick={() => navigate("/candidate/home")}>
                  Back to interviews
                </button>
              </div>
            </section>
          ) : null}

          {phase === "permissions" ? (
            <section className="interview-card">
              <LoaderCircle className="spin" size={28} />
              <h2>Waiting for browser permissions</h2>
              <p className="muted-copy">
                Approve the camera, microphone, and entire-screen sharing prompts from your browser or operating
                system.
              </p>
            </section>
          ) : null}

          {phase === "recording" && context && currentQuestion ? (
            <section className="interview-card">
              <div className="question-meta-row">
                <span className="pill-label">{progressLabel}</span>
                {questionStage === "thinking" ? (
                  <span className="pill-label time">
                    <TimerReset size={16} />
                    Thinking time {thinkingSecondsRemaining}s
                  </span>
                ) : context.time_mode === "fixed" ? (
                  <span className="pill-label time">
                    <TimerReset size={16} />
                    {secondsRemaining}s
                  </span>
                ) : (
                  <span className="pill-label">Free response</span>
                )}
              </div>
              <h2>{currentQuestion.text}</h2>
              <p className="muted-copy">
                {context.job_category} · {context.hr_name} · Difficulty {currentQuestion.difficulty}
              </p>
              {questionStage === "thinking" ? (
                <div className="note-card">
                  <strong>30-second thinking window</strong>
                  <p>
                    Use this time to plan your answer before you begin speaking or typing. The response timer starts
                    after this countdown ends.
                  </p>
                </div>
              ) : null}
              {currentQuestion.helper_text ? (
                <div className="note-card">
                  <strong>Instructions</strong>
                  <p>{currentQuestion.helper_text}</p>
                </div>
              ) : null}
              {currentQuestion.response_type === "code" && currentQuestion.starter_code ? (
                <div className="code-answer-card">
                  <strong>Starter code</strong>
                  <pre><code>{currentQuestion.starter_code}</code></pre>
                </div>
              ) : null}
              {currentQuestion.response_type !== "spoken" ? (
                <label className="note-input">
                  <span>{currentQuestion.response_type === "code" ? "Write your code here" : "Type your answer here"}</span>
                  <textarea
                    className={currentQuestion.response_type === "code" ? "code-textarea" : ""}
                    value={typedAnswers[currentQuestionIndex] ?? ""}
                    disabled={questionStage === "thinking"}
                    onChange={(event) => updateTypedAnswer(currentQuestionIndex, event.target.value)}
                  />
                </label>
              ) : null}
              <div className="button-row">
                {questionStage === "thinking" ? (
                  <button className="secondary-button" onClick={() => void skipThinkingTime()}>
                    Start answering now
                  </button>
                ) : null}
                {context.time_mode === "free" ? (
                  <button className="secondary-button" onClick={() => void nextQuestion()}>
                    {currentQuestionIndex === context.questions.length - 1 ? "Finish interview" : "Next question"}
                  </button>
                ) : null}
                <button className="secondary-button" onClick={() => void endInterview()}>
                  Finish and upload now
                </button>
              </div>
            </section>
          ) : null}

          {phase === "uploading" ? (
            <section className="interview-card">
              <LoaderCircle className="spin" size={28} />
              <h2>Uploading interview artifacts</h2>
              <p className="muted-copy">
                Your interview recording is being uploaded securely to the platform.
              </p>
            </section>
          ) : null}

          {phase === "complete" ? (
            <section className="interview-card">
              <h2>Interview submitted</h2>
              <p className="muted-copy">
                Session {sessionId} is queued for processing. Current backend status: {processingStatus}.
              </p>
              <div className="button-row">
                <a className="text-link" href="/candidate/home">
                  View completed interviews
                </a>
                <p className="muted-copy">You can now safely close this tab.</p>
              </div>
            </section>
          ) : null}

          {phase === "error" ? (
            <section className="interview-card">
              <h2>Something needs attention</h2>
              <p className="status-error">{error}</p>
              <div className="button-row">
                {canRetryUpload ? <button className="primary-button" onClick={() => void retryUpload()}>Retry saved recording</button> : null}
                <button className="primary-button" onClick={() => navigate("/candidate/home")}>
                  Back to interviews
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="interview-sidebar">
          <div className="webcam-frame">
            <video ref={webcamVideoRef} autoPlay muted playsInline />
          </div>
          <div className="side-stat-card">
            <strong>Recording preview</strong>
            <span>Keep your camera, microphone, and screen-share active until the upload finishes.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
