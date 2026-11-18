import { useRef, useState } from "react";
import { evaluatePracticeInterview } from "../api/client";
import type { EvaluationLabResult, PracticeLabConfig } from "../types/api";
import { useSessionCapture } from "./useSessionCapture";

export function usePracticeInterviewSession(config: PracticeLabConfig) {
  const [activeConfig, setConfig] = useState<PracticeLabConfig | null>(null);
  const [result, setResult] = useState<EvaluationLabResult | null>(null);
  const savedConfig = useRef(config);
  const capture = useSessionCapture({
    questions: (activeConfig ?? config).questions,
    timeMode: (activeConfig ?? config).time_mode,
    defaultSeconds: (activeConfig ?? config).time_limit_per_question,
    thinkingSeconds: 30,
    submit: async data => {
      data.set("lab_context", JSON.stringify(savedConfig.current));
      setResult(await evaluatePracticeInterview(data));
    },
  });
  return { ...capture, activeConfig, result, browserTranscript: "", transcriptMode: "backend" as const,
    startInterview: async () => { savedConfig.current = structuredClone(config); setConfig(savedConfig.current); setResult(null); await capture.startInterview(); },
    resetLabRun: () => { capture.reset(); setResult(null); setConfig(null); },
  };
}
