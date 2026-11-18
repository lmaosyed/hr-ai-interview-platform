import { ArrowLeft, LoaderCircle, Mic, Monitor, Plus, RotateCcw, ShieldCheck, Square, TimerReset, Video, Webcam } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

import { ConfidenceBreakdownChart } from "../components/ConfidenceBreakdownChart";
import { MetricCard } from "../components/MetricCard";
import { QuestionResponsesPanel } from "../components/QuestionResponsesPanel";
import { TimelineHeatmap } from "../components/TimelineHeatmap";
import { usePracticeInterviewSession } from "../hooks/usePracticeInterviewSession";
import type { PracticeLabConfig, QuestionResponseType } from "../types/api";

function defaultTimeForType(responseType: QuestionResponseType) {
  return responseType === "spoken" ? 120 : 600;
}

function createEmptyQuestion(responseType: QuestionResponseType = "spoken") {
  return {
    text: "",
    response_type: responseType,
    helper_text: "",
    starter_code: "",
    time_limit_seconds: defaultTimeForType(responseType),
    difficulty: "medium" as const,
    weight: 1,
  };
}

const defaultConfig: PracticeLabConfig = {
  title: "Practice interview session",
  category: "General",
  description:
    "Use this sandbox to test the same proctored recording pipeline that powers the real interview flow.",
  time_mode: "fixed",
  time_limit_per_question: 120,
  questions: [
    {
      text: "Tell me about yourself and why you are a strong fit for this role.",
      response_type: "spoken",
      helper_text: "Give a direct answer with examples from your actual work or projects.",
      starter_code: "",
      time_limit_seconds: 120,
      difficulty: "medium",
      weight: 1,
    },
  ],
};

export function EvaluationLabPage() {
  const [config, setConfig] = useState<PracticeLabConfig>(defaultConfig);
  const {
    activeConfig,
    phase,
    deviceStatus,
    currentQuestion,
    currentQuestionIndex,
    secondsRemaining,
    integrityEvents,
    gazeSnapshots,
    typedAnswers,
    error,
    proctorWarning,
    fullscreenRequired,
    questionStage,
    thinkingSecondsRemaining,
    skipThinkingTime,
    retryUpload,
    canRetryUpload,
    result,
    runDurationSeconds,
    webcamVideoRef,
    startInterview,
    endInterview,
    nextQuestion,
    updateTypedAnswer,
    resumeFullscreen,
    resetLabRun,
  } = usePracticeInterviewSession(config);

  const liveConfig = activeConfig ?? config;
  const editable = phase === "ready" || phase === "complete" || phase === "error";
  const validQuestionCount = config.questions.filter((question) => question.text.trim()).length;

  const scoreCards = useMemo(() => {
    if (!result) {
      return [];
    }
    return [
      { label: "Overall", value: result.session_score.overall_score },
      { label: "Answer quality", value: result.session_score.answer_quality_score },
      { label: "Confidence", value: result.session_score.confidence_score },
      { label: "Integrity", value: result.session_score.integrity_score },
      { label: "Communication", value: result.session_score.communication_score },
    ];
  }, [result]);

  const progressLabel = useMemo(() => {
    const totalQuestions = liveConfig.questions.length || 1;
    return `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
  }, [currentQuestionIndex, liveConfig.questions.length]);

  function updateQuestionField<T extends keyof PracticeLabConfig["questions"][number]>(
    questionIndex: number,
    field: T,
    value: PracticeLabConfig["questions"][number][T],
  ) {
    setConfig((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex ? { ...question, [field]: value } : question,
      ),
    }));
  }

  function loadSampleSetup() {
    setConfig(defaultConfig);
    resetLabRun();
  }

  return (
    <div className="dashboard-layout evaluation-lab-layout">
      {proctorWarning ? <div className="proctor-banner">{proctorWarning}</div> : null}

      <header className="page-header">
        <div>
          <span className="eyebrow">Evaluation lab</span>
          <h1>Full practice pipeline</h1>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={loadSampleSetup}>
            <RotateCcw size={18} />
            Reset sample
          </button>
          <Link className="secondary-button" to="/">
            <ArrowLeft size={18} />
            Back home
          </Link>
        </div>
      </header>

      <section className="candidate-hero-card">
        <div>
          <span className="eyebrow">Same capture stack as the app</span>
          <h2>Stress-test the actual interview system</h2>
        </div>
        <p className="muted-copy">
          This lab records webcam, microphone, and entire-screen share, enforces fullscreen, logs tab and copy events,
          captures gaze snapshots, and returns the full analytics payload after every run.
        </p>
      </section>

      <section className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Practice setup</span>
          <h2>Build the interview you want to rehearse</h2>
        </div>
        <div className="form-grid">
          <label>
            Session title
            <input
              disabled={!editable}
              value={config.title}
              onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Category
            <input
              disabled={!editable}
              value={config.category}
              onChange={(event) => setConfig((current) => ({ ...current, category: event.target.value }))}
            />
          </label>
          <label className="full-width">
            Interview description
            <textarea
              disabled={!editable}
              value={config.description}
              onChange={(event) => setConfig((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label>
            Time mode
            <select
              disabled={!editable}
              value={config.time_mode}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  time_mode: event.target.value as PracticeLabConfig["time_mode"],
                }))
              }
            >
              <option value="fixed">Fixed</option>
              <option value="free">Free</option>
            </select>
          </label>
          <label>
            Default timer (seconds)
            <input
              disabled={!editable || config.time_mode === "free"}
              value={config.time_limit_per_question ?? ""}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  time_limit_per_question: Number(event.target.value || 0),
                }))
              }
            />
          </label>
        </div>

        <div className="question-builder">
          <div className="section-heading compact">
            <span className="eyebrow">Questions</span>
            <h3>{validQuestionCount} active prompts</h3>
          </div>
          <div className="accordion-stack">
            {config.questions.map((question, index) => (
              <div className="question-editor-card" key={`${index}-${question.response_type}`}>
                <div className="question-editor-header">
                  <strong>Question {index + 1}</strong>
                  <button
                    className="secondary-button small"
                    disabled={!editable || config.questions.length === 1}
                    type="button"
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        questions: current.questions.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="form-grid">
                  <label className="full-width">
                    Prompt
                    <textarea
                      disabled={!editable}
                      value={question.text}
                      onChange={(event) => updateQuestionField(index, "text", event.target.value)}
                    />
                  </label>
                  <label>
                    Response type
                    <select
                      disabled={!editable}
                      value={question.response_type}
                      onChange={(event) => {
                        const responseType = event.target.value as QuestionResponseType;
                        updateQuestionField(index, "response_type", responseType);
                        updateQuestionField(index, "time_limit_seconds", defaultTimeForType(responseType));
                      }}
                    >
                      <option value="spoken">Spoken answer</option>
                      <option value="text">Text answer</option>
                      <option value="code">Code answer</option>
                    </select>
                  </label>
                  <label>
                    Timer (seconds)
                    <input
                      disabled={!editable || config.time_mode === "free"}
                      value={question.time_limit_seconds ?? ""}
                      onChange={(event) => updateQuestionField(index, "time_limit_seconds", Number(event.target.value || 0))}
                    />
                  </label>
                  <label>
                    Difficulty
                    <select
                      disabled={!editable}
                      value={question.difficulty}
                      onChange={(event) =>
                        updateQuestionField(
                          index,
                          "difficulty",
                          event.target.value as PracticeLabConfig["questions"][number]["difficulty"],
                        )
                      }
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label>
                    Weight
                    <input
                      disabled={!editable}
                      value={question.weight}
                      onChange={(event) => updateQuestionField(index, "weight", Number(event.target.value || 1))}
                    />
                  </label>
                  <label className="full-width">
                    Extra instructions
                    <textarea
                      disabled={!editable}
                      value={question.helper_text ?? ""}
                      onChange={(event) => updateQuestionField(index, "helper_text", event.target.value)}
                    />
                  </label>
                  {question.response_type === "code" ? (
                    <label className="full-width">
                      Starter code or snippet
                      <textarea
                        disabled={!editable}
                        value={question.starter_code ?? ""}
                        onChange={(event) => updateQuestionField(index, "starter_code", event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button
            className="secondary-button small"
            disabled={!editable}
            type="button"
            onClick={() =>
              setConfig((current) => ({
                ...current,
                questions: [...current.questions, createEmptyQuestion()],
              }))
            }
          >
            <Plus size={16} />
            Add question
          </button>
        </div>
      </section>

      <div className="interview-grid">
        <div className="interview-panel">
          {fullscreenRequired ? (
            <section className="interview-card rule-warning-card">
              <h2>Fullscreen mode is required</h2>
              <p className="muted-copy">
                Return to fullscreen before continuing. The timer pauses while fullscreen is off.
              </p>
              <button className="primary-button" onClick={() => void resumeFullscreen()}>
                Return to fullscreen
              </button>
            </section>
          ) : null}

          {phase === "ready" ? (
            <section className="interview-card interview-start-card">
              <div className="section-heading compact">
                <span className="eyebrow">Ready</span>
                <h2>Launch the full practice run</h2>
              </div>
              <p className="muted-copy">
                {validQuestionCount
                  ? `${validQuestionCount} question${validQuestionCount === 1 ? "" : "s"} will run through the same capture rules as the real interview page.`
                  : "Add at least one question before starting."}
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
                  Practice-run rules
                </strong>
                <p>Share the entire screen, stay on this tab, keep fullscreen active, and answer naturally.</p>
              </div>
              {error ? <p className="status-error">{error}</p> : null}
              <div className="button-row">
                <button className="primary-button" disabled={!validQuestionCount} onClick={() => void startInterview()}>
                  <Video size={18} />
                  Start full practice run
                </button>
                {result ? (
                  <button className="secondary-button" onClick={resetLabRun}>
                    <RotateCcw size={18} />
                    Clear last run
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {phase === "permissions" ? (
            <section className="interview-card">
              <LoaderCircle className="spin" size={28} />
              <h2>Waiting for browser permissions</h2>
              <p className="muted-copy">
                Approve the camera, microphone, and entire-screen sharing prompts. Fullscreen begins immediately after permissions are granted.
              </p>
            </section>
          ) : null}

          {phase === "recording" && currentQuestion ? (
            <section className="interview-card">
              <div className="question-meta-row">
                <span className="pill-label">{progressLabel}</span>
                {questionStage === "thinking" ? <span className="pill-label time">Thinking time: {thinkingSecondsRemaining}s</span> : liveConfig.time_mode === "fixed" ? (
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
                {liveConfig.category} · Difficulty {currentQuestion.difficulty} · Weight {currentQuestion.weight}
              </p>
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
                    disabled={questionStage === "thinking" || fullscreenRequired}
                    className={currentQuestion.response_type === "code" ? "code-textarea" : ""}
                    value={typedAnswers[currentQuestionIndex] ?? ""}
                    onChange={(event) => updateTypedAnswer(currentQuestionIndex, event.target.value)}
                  />
                </label>
              ) : null}
              <div className="button-row">
                {questionStage === "thinking" ? <button className="primary-button" onClick={skipThinkingTime}>Start answering now</button> : (
                  <button className="secondary-button" onClick={() => void nextQuestion()}>
                    {currentQuestionIndex === liveConfig.questions.length - 1 ? "Finish practice run" : "Next question"}
                  </button>
                )}
                <button className="secondary-button" onClick={() => void endInterview()}>
                  <Square size={18} />
                  Finish and analyze now
                </button>
              </div>
            </section>
          ) : null}

          {phase === "uploading" ? (
            <section className="interview-card">
              <LoaderCircle className="spin" size={28} />
              <h2>Uploading practice artifacts</h2>
              <p className="muted-copy">
                Webcam, screen, audio, gaze, and integrity signals are being packaged for analytics.
              </p>
            </section>
          ) : null}

          {phase === "complete" && result ? (
            <section className="interview-card">
              <div className="section-heading compact">
                <span className="eyebrow">Run complete</span>
                <h2>{result.title}</h2>
              </div>
              <p className="muted-copy">
                Practice run {result.practice_id} finished in {result.duration_seconds}s. Scroll below for the full analytics.
              </p>
              <div className="button-row">
                <button className="primary-button" onClick={resetLabRun}>
                  <RotateCcw size={18} />
                  Prepare another run
                </button>
              </div>
            </section>
          ) : null}

          {phase === "error" ? (
            <section className="interview-card">
              <h2>Something needs attention</h2>
              <p className="status-error">{error}</p>
              <div className="button-row">
                {canRetryUpload ? <button className="primary-button" onClick={() => void retryUpload()}>Retry saved recording</button> : null}
                <button className="primary-button" onClick={resetLabRun}>
                  Reset the lab
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="interview-sidebar">
          <div className="webcam-frame practice-preview">
            <video ref={webcamVideoRef} autoPlay muted playsInline />
          </div>
          <div className="detail-card">
            <strong>Recorded audio transcription</strong>
            <p className="muted-copy">
              Your recorded answer audio is transcribed after submission, using each question's actual answer window.
            </p>
            <p className="muted-copy">Transcripts and measured silent gaps appear with your results.</p>
          </div>
          <div className="detail-card">
            <strong>Capture health</strong>
            <p className="muted-copy">Integrity events: {integrityEvents.length}</p>
            <p className="muted-copy">Gaze snapshots: {gazeSnapshots.length}</p>
            <p className="muted-copy">Elapsed duration: {runDurationSeconds || 0}s</p>
          </div>
          <div className="detail-card">
            <strong>Why this lab exists</strong>
            <p className="muted-copy">
              Use it to test transcripts, analytics, integrity detection, and end-to-end scoring without touching candidate or HR records.
            </p>
          </div>
        </aside>
      </div>

      {result ? (
        <>
          <section className="metrics-grid">
            {scoreCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} />
            ))}
          </section>

          <div className="two-column-detail">
            <ConfidenceBreakdownChart breakdown={result.session_score.score_breakdown} />
            <TimelineHeatmap
              durationSeconds={result.duration_seconds}
              events={result.session_score.timeline_events ?? []}
            />
          </div>

          <section className="chart-card">
            <div className="section-heading compact">
              <span className="eyebrow">Integrity and explainability</span>
              <h3>What the practice run detected</h3>
            </div>
            <div className="two-column-detail">
              <div className="notes-stack">
                <div className="detail-card">
                  <strong>Risk level</strong>
                  <p className="muted-copy">
                    {result.session_score.risk_level ?? "n/a"} risk · Integrity {Math.round(result.session_score.integrity_score ?? 0)}
                  </p>
                </div>
                {(result.session_score.explainability?.integrity_reasons ?? []).map((reason) => (
                  <div className="log-item" key={reason}>
                    <ShieldCheck size={18} />
                    <span>{reason}</span>
                  </div>
                ))}
                {result.integrity_events.map((event) => (
                  <div className="log-item" key={`${event.event_type}-${event.timestamp_seconds}-${event.description}`}>
                    <span>
                      {event.description} · {event.timestamp_seconds.toFixed(1)}s · {event.severity}
                    </span>
                  </div>
                ))}
              </div>
              <div className="notes-stack">
                <div className="detail-card">
                  <strong>Confidence reasoning</strong>
                  <p className="muted-copy">
                    Transcript source: {result.transcription_provider} · {result.demo_mode ? "Demo scoring configured" : "Live scoring configured"}
                  </p>
                </div>
                {(result.session_score.explainability?.confidence_reasons ?? []).map((reason) => (
                  <div className="log-item" key={reason}>
                    <span>{reason}</span>
                  </div>
                ))}
                <div className="detail-card">
                  <strong>Gaze summary</strong>
                  <p className="muted-copy">
                    On-screen ratio: {Math.round((result.gaze_summary.on_screen_ratio ?? 0) * 100)}%
                  </p>
                  <p className="muted-copy">
                    Deviation frequency: {Math.round((result.gaze_summary.deviation_frequency ?? 0) * 100)}%
                  </p>
                  <p className="muted-copy">
                    Longest off-screen streak: {Number(result.gaze_summary.longest_off_screen_streak ?? 0).toFixed(1)}s
                  </p>
                  <p className="muted-copy">
                    Samples captured: {Math.round(result.gaze_summary.sample_count ?? 0)}
                  </p>
                </div>
                {result.audio_metrics ? <div className="detail-card">
                  <strong>Measured speech activity</strong>
                  <p>Speech: {Number(result.audio_metrics.speech_seconds ?? 0).toFixed(1)}s</p>
                  <p>Silence: {Math.round(Number(result.audio_metrics.silence_ratio ?? 0) * 100)}%</p>
                  <p>Pauses of at least 2s: {result.audio_metrics.long_pause_count ?? 0}</p>
                  <p>Longest pause: {Number(result.audio_metrics.longest_pause_seconds ?? 0).toFixed(1)}s</p>
                </div> : null}
              </div>
            </div>
          </section>

          <QuestionResponsesPanel
            questions={result.question_responses}
            typedResponses={result.typed_responses}
          />

          <div className="two-column-detail">
            <section className="chart-card">
              <div className="section-heading compact">
                <span className="eyebrow">Transcript</span>
                <h3>What the system heard</h3>
              </div>
              <p className="summary-copy">{result.transcript}</p>
            </section>

            <section className="chart-card">
              <div className="section-heading compact">
                <span className="eyebrow">Summary</span>
                <h3>AI recommendation</h3>
              </div>
              <p className="summary-copy">{result.session_score.ai_summary ?? result.summary}</p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
