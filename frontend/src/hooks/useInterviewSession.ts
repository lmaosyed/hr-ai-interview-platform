import { useEffect, useState } from "react";
import { fetchInterviewContext, uploadInterviewSession, fetchSessionStatus } from "../api/client";
import type { InterviewContext, ProcessingStatus } from "../types/api";
import { useSessionCapture } from "./useSessionCapture";
import { getCandidateSession, setCandidateSession } from "../utils/session";

export function useInterviewSession(token: string | undefined) {
  const [context, setContext] = useState<InterviewContext | null>(null);
  const [loadError, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [processingStatus, setStatus] = useState<ProcessingStatus | null>(null);
  useEffect(() => {
    let active = true;
    if (!token) { setError("Open the interview from your candidate account."); return; }
    fetchInterviewContext(token).then(data => { if (active) setContext(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    if (!sessionId || processingStatus === "done" || processingStatus === "failed") return;
    let active = true;
    const timer = window.setInterval(() => { fetchSessionStatus(sessionId).then(data => {
      if (active) setStatus(data.processing_status);
    }).catch(() => {}); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionId, processingStatus]);
  const capture = useSessionCapture({
    questions: context?.questions ?? [], timeMode: context?.time_mode ?? "fixed",
    defaultSeconds: context?.time_limit_per_question ?? 120, thinkingSeconds: 30,
    submit: async data => {
      if (!context || !token) throw new Error("Interview details are missing.");
      data.set("candidate_id", String(context.candidate_id)); data.set("interview_token", token);
      const response = await uploadInterviewSession(data);
      setSessionId(response.session_id); setStatus(response.processing_status);
      const session = getCandidateSession();
      if (session) setCandidateSession({ ...session, applications: session.applications.map(application =>
        application.candidate_id === context.candidate_id ? { ...application, status: "completed" } : application) });
    },
  });
  return { ...capture, context, sessionId, processingStatus,
    phase: loadError ? "error" : !context ? "loading" : capture.phase, error: loadError ?? capture.error };
}
