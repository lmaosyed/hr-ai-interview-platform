type RecorderKind = "video" | "screen" | "audio";

export async function prepareInterviewMedia() {
  if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Use a desktop browser with camera, microphone, and entire-screen sharing support.");
  }
  // Screen capture must be the first request made directly from the click.
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    if (screen.getVideoTracks()[0]?.getSettings().displaySurface !== "monitor") {
      throw new Error("Choose Entire Screen in the sharing prompt. Window/tab sharing cannot start an interview.");
    }
    const webcam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: true });
    return { screen, webcam };
  } catch (error) {
    screen.getTracks().forEach(track => track.stop());
    throw error;
  }
}

export interface AnswerWindow { question_index: number; start_seconds: number; end_seconds: number }

export function createAnswerClock() {
  const windows: AnswerWindow[] = [];
  let active: { index: number; start: number } | null = null;
  return {
    begin(index: number, seconds: number) {
      if (active?.index === index) return;
      if (active) windows.push({ question_index: active.index, start_seconds: active.start, end_seconds: seconds });
      active = { index, start: seconds };
    },
    finish(seconds: number) {
      if (active) windows.push({ question_index: active.index, start_seconds: active.start, end_seconds: seconds });
      active = null;
      return windows;
    },
  };
}

const VIDEO_RECORDER_CANDIDATES: MediaRecorderOptions[] = [
  { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 850_000 },
  { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 850_000 },
  { mimeType: "video/webm", videoBitsPerSecond: 850_000 },
  { videoBitsPerSecond: 850_000 },
  {},
];

const AUDIO_RECORDER_CANDIDATES: MediaRecorderOptions[] = [
  { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 128_000 },
  { mimeType: "audio/webm", audioBitsPerSecond: 128_000 },
  { audioBitsPerSecond: 128_000 },
  {},
];

function supportedRecorderOptions(options: MediaRecorderOptions) {
  if (!options.mimeType) {
    return true;
  }
  return typeof MediaRecorder.isTypeSupported === "function"
    ? MediaRecorder.isTypeSupported(options.mimeType)
    : true;
}

export function createInterviewRecorder(stream: MediaStream, kind: RecorderKind) {
  const candidates = kind === "audio" ? AUDIO_RECORDER_CANDIDATES : VIDEO_RECORDER_CANDIDATES;
  for (const options of candidates) {
    if (!supportedRecorderOptions(options)) {
      continue;
    }
    try {
      return new MediaRecorder(stream, options);
    } catch {
      continue;
    }
  }
  return new MediaRecorder(stream);
}
