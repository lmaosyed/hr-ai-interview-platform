import { useEffect, useRef, useState } from "react";
import type { GazeSnapshot, InterviewIntegrityEvent, JobQuestion } from "../types/api";
import { createAttentionMonitor } from "../utils/attention";
import { startGazeTracking } from "../utils/gaze";
import { createAnswerClock, createInterviewRecorder, prepareInterviewMedia } from "../utils/interviewMedia";

export type CapturePhase = "ready" | "permissions" | "recording" | "uploading" | "complete" | "error";

async function fullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
}

function stopRecording(recorder: MediaRecorder, parts: BlobPart[]) {
  return new Promise<Blob>((resolve, reject) => {
    const done = () => resolve(new Blob(parts, { type: recorder.mimeType }));
    if (recorder.state === "inactive") return done();
    recorder.addEventListener("stop", done, { once: true });
    recorder.addEventListener("error", () => reject(new Error("Recording failed. Please try again.")), { once: true });
    recorder.stop();
  });
}

export function useSessionCapture(options: {
  questions: JobQuestion[]; timeMode: "fixed" | "free"; defaultSeconds: number | null;
  thinkingSeconds: number; submit: (data: FormData) => Promise<void>;
}) {
  const [phase, setPhase] = useState<CapturePhase>("ready");
  const [deviceStatus, setDeviceStatus] = useState({ webcam: false, mic: false, screen: false, error: "" });
  const [error, setError] = useState<string | null>(null);
  const [proctorWarning, setWarning] = useState<string | null>(null);
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [currentQuestionIndex, setIndex] = useState(0);
  const [questionStage, setStage] = useState<"thinking" | "answering">("thinking");
  const [thinkingSecondsRemaining, setThinking] = useState(options.thinkingSeconds);
  const [secondsRemaining, setSeconds] = useState(0);
  const [integrityEvents, setEvents] = useState<InterviewIntegrityEvent[]>([]);
  const [gazeSnapshots, setGaze] = useState<GazeSnapshot[]>([]);
  const [typedAnswers, setAnswers] = useState<Record<number, string>>({});
  const [runDurationSeconds, setDuration] = useState(0);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const streams = useRef<{ webcam: MediaStream; screen: MediaStream } | null>(null);
  const recorders = useRef<{ recorder: MediaRecorder; parts: BlobPart[]; name: string }[]>([]);
  const cleanup = useRef<(() => void) | null>(null);
  const started = useRef(0);
  const busy = useRef(false);
  const events = useRef<InterviewIntegrityEvent[]>([]);
  const gaze = useRef<GazeSnapshot[]>([]);
  const answers = useRef<Record<number, string>>({});
  const clock = useRef(createAnswerClock());
  const latest = useRef(options);
  latest.current = options;
  const warningTimer = useRef<number>();
  const retryData = useRef<FormData | null>(null);
  const mounted = useRef(true);
  const elapsed = () => (Date.now() - started.current) / 1000;

  function warn(message: string) {
    setWarning(message);
    window.clearTimeout(warningTimer.current);
    warningTimer.current = window.setTimeout(() => setWarning(null), 4000);
  }
  function event(item: InterviewIntegrityEvent) {
    events.current.push(item);
    setEvents([...events.current]);
  }
  function stopStreams() {
    streams.current?.webcam.getTracks().forEach(t => t.stop());
    streams.current?.screen.getTracks().forEach(t => t.stop());
    streams.current = null;
    if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
  }
  function dispose() {
    cleanup.current?.(); cleanup.current = null;
    recorders.current.forEach(({ recorder }) => { if (recorder.state !== "inactive") recorder.stop(); });
    stopStreams(); window.clearTimeout(warningTimer.current);
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; dispose(); };
  }, []);
  useEffect(() => {
    if (phase !== "recording") return;
    const timeout = window.setTimeout(() => void endInterview(), Math.max(0, 14400000 - (Date.now() - started.current)));
    return () => window.clearTimeout(timeout);
  }, [phase]);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setDuration(Math.max(0, Math.floor(elapsed()))), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording" || fullscreenRequired) return;
    if (questionStage === "answering") clock.current.begin(currentQuestionIndex, elapsed());
    const deadline = Date.now() + (questionStage === "thinking" ? thinkingSecondsRemaining : secondsRemaining) * 1000;
    if (questionStage === "answering" && latest.current.timeMode === "free") return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (questionStage === "thinking") setThinking(left); else setSeconds(left);
      if (left === 0) {
        window.clearInterval(timer);
        if (questionStage === "thinking") setStage("answering"); else nextQuestion();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, fullscreenRequired, questionStage, currentQuestionIndex]);

  async function startInterview() {
    if (busy.current) return;
    if (!latest.current.questions.length || latest.current.questions.some(q => !q.text.trim())) {
      setError("Enter at least one complete interview question."); return;
    }
    busy.current = true; setPhase("permissions"); setError(null);
    try {
      if (streams.current && [...streams.current.webcam.getTracks(), ...streams.current.screen.getTracks()].some(t => t.readyState === "ended")) {
        stopStreams();
      }
      if (!streams.current) streams.current = await prepareInterviewMedia();
      if (!mounted.current) { stopStreams(); return; }
      const { webcam, screen } = streams.current;
      // Request before waiting for video playback, preserving the click's activation.
      const fullscreenAttempt = fullscreen();
      if (webcamVideoRef.current) { webcamVideoRef.current.srcObject = webcam; void webcamVideoRef.current.play().catch(() => {}); }
      setDeviceStatus({ webcam: true, mic: true, screen: true, error: "" });
      try { await fullscreenAttempt; } catch {
        setError("Permissions are ready. Click start once more to enter fullscreen; your browser requires this extra click.");
        setPhase("ready"); return;
      }
      if (!mounted.current) { stopStreams(); return; }
      events.current = []; gaze.current = []; answers.current = {}; clock.current = createAnswerClock();
      setEvents([]); setGaze([]); setAnswers({}); setDuration(0); setWarning(null); retryData.current = null;
      started.current = Date.now();
      recorders.current = [
        { recorder: createInterviewRecorder(webcam, "video"), parts: [], name: "video" },
        { recorder: createInterviewRecorder(screen, "screen"), parts: [], name: "screen" },
        { recorder: createInterviewRecorder(new MediaStream(webcam.getAudioTracks()), "audio"), parts: [], name: "audio" },
      ];
      recorders.current.forEach(item => {
        item.recorder.ondataavailable = e => { if (e.data.size) item.parts.push(e.data); };
        item.recorder.start(1000);
      });
      let hiddenAt: number | null = null;
      let fullscreenAt: number | null = null;
      const finishWindow = (type: string, start: number | null) => {
        if (start === null) return;
        const duration = elapsed() - start;
        if (duration >= 1.5) event({ event_type: type, timestamp_seconds: start, duration_seconds: duration,
          severity: duration > 6 ? "high" : "medium", description: `${type === "tab_switch" ? "Interview tab inactive" : "Fullscreen inactive"} for ${duration.toFixed(1)} seconds.` });
      };
      const visibility = () => {
        if (document.hidden) hiddenAt ??= elapsed();
        else { finishWindow("tab_switch", hiddenAt); hiddenAt = null; }
      };
      const fs = () => {
        setFullscreenRequired(!document.fullscreenElement);
        if (!document.fullscreenElement) { fullscreenAt ??= elapsed(); warn("Return to fullscreen to continue the interview."); }
        else { finishWindow("screen_inactive", fullscreenAt); fullscreenAt = null; }
      };
      const copy = () => {
        event({ event_type: "copy_paste", timestamp_seconds: elapsed(), severity: "medium", description: "Copy or paste activity recorded for review." });
        warn("Copy and paste activity is recorded during the interview.");
      };
      const monitor = createAttentionMonitor(event, warn);
      const stopGaze = webcamVideoRef.current ? await startGazeTracking(webcamVideoRef.current, sample => {
        const calibrated = monitor.accept({ ...sample, timestamp_seconds: elapsed() });
        gaze.current.push(calibrated); setGaze([...gaze.current]);
      }) : () => {};
      const track = screen.getVideoTracks()[0];
      track.onended = () => { dispose(); setError("Screen sharing ended. Start again and keep entire-screen sharing enabled."); setPhase("error"); };
      document.addEventListener("visibilitychange", visibility); document.addEventListener("fullscreenchange", fs);
      document.addEventListener("copy", copy); document.addEventListener("paste", copy);
      cleanup.current = () => {
        finishWindow("tab_switch", hiddenAt); finishWindow("screen_inactive", fullscreenAt); hiddenAt = null; fullscreenAt = null;
        monitor.finish(); stopGaze(); track.onended = null;
        document.removeEventListener("visibilitychange", visibility); document.removeEventListener("fullscreenchange", fs);
        document.removeEventListener("copy", copy); document.removeEventListener("paste", copy);
      };
      setIndex(0); setStage(latest.current.thinkingSeconds ? "thinking" : "answering"); setThinking(latest.current.thinkingSeconds);
      setSeconds(latest.current.questions[0].time_limit_seconds ?? latest.current.defaultSeconds ?? 120);
      setFullscreenRequired(false); setPhase("recording");
    } catch (err) {
      dispose(); setPhase("ready"); setError(err instanceof Error ? err.message : "Allow camera, microphone, and entire-screen sharing to continue.");
    } finally { busy.current = false; }
  }

  async function upload(data: FormData) {
    setPhase("uploading");
    try { await latest.current.submit(data); retryData.current = null; setPhase("complete"); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Upload failed. Please retry."); setPhase("error"); }
  }
  async function endInterview() {
    if (busy.current || !started.current || !recorders.current.length) return;
    busy.current = true; setPhase("uploading");
    try {
      const ended = Date.now(); const windows = clock.current.finish((ended - started.current) / 1000);
      cleanup.current?.(); cleanup.current = null;
      const blobs = await Promise.all(recorders.current.map(item => stopRecording(item.recorder, item.parts)));
      const data = new FormData();
      recorders.current.forEach((item, index) => data.append(item.name, blobs[index], `${item.name}.webm`));
      const duration = Math.max(1, Math.round((ended - started.current) / 1000)); setDuration(duration);
      data.append("started_at", new Date(started.current).toISOString()); data.append("ended_at", new Date(ended).toISOString());
      data.append("duration_seconds", String(duration)); data.append("gaze_data", JSON.stringify(gaze.current));
      data.append("integrity_events", JSON.stringify(events.current)); data.append("answer_windows", JSON.stringify(windows));
      data.append("typed_answers", JSON.stringify(latest.current.questions.map((q, index) => ({ question_index: index, question_text: q.text,
        response_type: q.response_type, answer_text: answers.current[index] ?? "", helper_text: q.helper_text }))));
      stopStreams(); recorders.current = []; started.current = 0;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      retryData.current = data; await upload(data);
    } catch (err) { dispose(); setError(err instanceof Error ? err.message : "Could not finish recording."); setPhase("error"); }
    finally { busy.current = false; }
  }
  function nextQuestion() {
    if (currentQuestionIndex >= latest.current.questions.length - 1) { void endInterview(); return; }
    clock.current.finish(elapsed());
    const next = currentQuestionIndex + 1;
    setIndex(next); setStage(latest.current.thinkingSeconds ? "thinking" : "answering"); setThinking(latest.current.thinkingSeconds);
    setSeconds(latest.current.questions[next].time_limit_seconds ?? latest.current.defaultSeconds ?? 120);
  }
  return {
    phase, deviceStatus, error, proctorWarning, fullscreenRequired, currentQuestionIndex,
    currentQuestion: options.questions[currentQuestionIndex] ?? null, questionStage, thinkingSecondsRemaining,
    secondsRemaining, integrityEvents, gazeSnapshots, typedAnswers, webcamVideoRef, runDurationSeconds,
    startInterview, endInterview, nextQuestion,
    skipThinkingTime: () => { setThinking(0); setStage("answering"); },
    resumeFullscreen: async () => { try { await fullscreen(); setFullscreenRequired(false); } catch { setError("Click Return to fullscreen to continue."); } },
    updateTypedAnswer: (index: number, value: string) => { answers.current[index] = value; setAnswers({ ...answers.current }); },
    reset: () => { dispose(); started.current = 0; retryData.current = null; setPhase("ready"); setError(null); setFullscreenRequired(false); setWarning(null); },
    retryUpload: () => retryData.current ? upload(retryData.current) : Promise.resolve(),
    canRetryUpload: retryData.current !== null,
  };
}
