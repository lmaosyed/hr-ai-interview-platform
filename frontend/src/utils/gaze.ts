import { FaceMesh } from "@mediapipe/face_mesh";

import type { GazeSnapshot } from "../types/api";

function directionFromCoordinates(gazeX: number, gazeY: number): GazeSnapshot["direction"] {
  if (gazeX < -0.085) {
    return "left";
  }
  if (gazeX > 0.085) {
    return "right";
  }
  if (gazeY < -0.075) {
    return "up";
  }
  if (gazeY > 0.075) {
    return "down";
  }
  return "center";
}

export async function startGazeTracking(
  video: HTMLVideoElement,
  onSnapshot: (snapshot: GazeSnapshot) => void,
) {
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let lastEmittedAt = 0;
  let animationFrame = 0;
  let isStopped = false;
  const startedAt = performance.now();

  faceMesh.onResults((results: any) => {
    if (isStopped) return;
    const now = performance.now();
    if (now - lastEmittedAt < 500) {
      return;
    }
    lastEmittedAt = now;

    const landmarks = results?.multiFaceLandmarks?.[0];
    if (!landmarks) {
      onSnapshot({
        timestamp_seconds: Number(((now - startedAt) / 1000).toFixed(2)),
        gaze_x: 0,
        gaze_y: 0,
        direction: "center",
        is_on_screen: false,
        confidence: 0.12,
      });
      return;
    }

    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const noseTip = landmarks[1];

    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const eyeMidY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
    const eyeSpan = Math.max(0.04, Math.hypot(leftEyeOuter.x - rightEyeOuter.x, leftEyeOuter.y - rightEyeOuter.y));
    const gazeX = Number(((noseTip.x - eyeMidX) / eyeSpan).toFixed(4));
    const gazeY = Number(((noseTip.y - eyeMidY) / eyeSpan).toFixed(4));
    const direction = directionFromCoordinates(gazeX, gazeY);
    const horizontalDistance = Math.abs(gazeX);
    const verticalDistance = Math.abs(gazeY);
    const isOnScreen = horizontalDistance <= 0.11 && verticalDistance <= 0.1;
    const confidence = Number(
      Math.max(0.35, 0.97 - horizontalDistance * 1.35 - verticalDistance * 1.15).toFixed(2),
    );

    onSnapshot({
      timestamp_seconds: Number(((now - startedAt) / 1000).toFixed(2)),
      gaze_x: gazeX,
      gaze_y: gazeY,
      direction,
      is_on_screen: isOnScreen,
      confidence,
    });
  });

  const loop = async () => {
    if (isStopped) {
      return;
    }
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        await faceMesh.send({ image: video });
      } catch {
        // A failed model/frame is a tracking outage, never evidence of cheating.
        return;
      }
    }
    if (!isStopped) animationFrame = window.setTimeout(loop, 500);
  };

  animationFrame = window.setTimeout(loop, 0);

  return () => {
    isStopped = true;
    window.clearTimeout(animationFrame);
    void faceMesh.close();
  };
}
