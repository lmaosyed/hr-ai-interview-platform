import type { GazeSnapshot, InterviewIntegrityEvent } from "../types/api";

// A face-landmark estimate cannot identify where someone is actually looking.
// Use a broad calibrated zone and emit one review event per sustained episode.
export function createAttentionMonitor(onEvent: (event: InterviewIntegrityEvent) => void, onWarning: (message: string) => void) {
  const baseline: GazeSnapshot[] = [];
  let center: { x: number; y: number } | null = null;
  let episode: { key: string; start: number; last: number; warned: boolean } | null = null;

  function finish() {
    if (!episode) return;
    const duration = episode.last - episode.start;
    const threshold = episode.key.startsWith("edge") ? 10 : 3;
    if (duration >= threshold) onEvent({
      event_type: episode.key === "missing" ? "off_screen" : "gaze_deviation",
      timestamp_seconds: episode.start,
      duration_seconds: Number(duration.toFixed(2)),
      severity: duration >= 15 ? "medium" : "low",
      description: episode.key === "missing"
        ? `Face tracking was unavailable for ${duration.toFixed(1)} seconds; review the recording.`
        : `Estimated attention stayed ${episode.key.replace("-", " ")} for ${duration.toFixed(1)} seconds; review the recording.`,
    });
    episode = null;
  }

  function accept(sample: GazeSnapshot): GazeSnapshot {
    if (sample.confidence >= 0.3 && !center) {
      baseline.push(sample);
      if (baseline.length >= 6) {
        const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
        center = { x: median(baseline.map(s => s.gaze_x)), y: median(baseline.map(s => s.gaze_y)) };
      }
      return { ...sample, is_on_screen: true, direction: "center" };
    }
    const x = sample.gaze_x - (center?.x ?? 0);
    const y = sample.gaze_y - (center?.y ?? 0);
    const direction = Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
    const missing = sample.confidence < 0.3;
    const inside = !missing && Math.abs(x) < 0.25 && Math.abs(y) < 0.3;
    const edge = !missing && Math.abs(x) < 0.45 && Math.abs(y) < 0.5;
    const key = missing ? "missing" : inside ? "screen" : `${edge ? "edge" : "beyond"}-${direction}`;
    if (key === "screen") finish();
    else {
      // A throttled/background frame must not count as continuous camera evidence.
      if (episode && (episode.key !== key || sample.timestamp_seconds - episode.last > 1.5)) finish();
      episode ??= { key, start: sample.timestamp_seconds, last: sample.timestamp_seconds, warned: false };
      episode.last = sample.timestamp_seconds;
      if (!episode.warned && episode.last - episode.start >= (edge ? 10 : 3)) {
        episode.warned = true;
        onWarning(missing ? "Your face is not clearly visible. Check the camera framing." : "Please keep your attention within the interview screen.");
      }
    }
    return { ...sample, gaze_x: x, gaze_y: y, direction: inside ? "center" : direction, is_on_screen: inside || edge };
  }
  return { accept, finish };
}
