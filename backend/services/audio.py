"""Measured audio activity and exact answer-window transcription."""

import re
import subprocess
from pathlib import Path


def audio_activity(path: str | Path, duration_seconds: float) -> dict:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(path), "-af",
        "silencedetect=noise=-38dB:d=0.8", "-f", "null", "-",
    ], capture_output=True, text=True, timeout=180, check=True)
    starts = [float(value) for value in re.findall(r"silence_start: ([\d.]+)", result.stderr)]
    ends = [float(value) for value in re.findall(r"silence_end: ([\d.]+)", result.stderr)]
    gaps = [(start, max(start, ends[index] if index < len(ends) else duration_seconds))
            for index, start in enumerate(starts)]
    silence_seconds = min(duration_seconds, sum(end - start for start, end in gaps))
    pauses = [end - start for start, end in gaps if start > 0.5 and end < duration_seconds - 0.5]
    return {
        "duration_seconds": round(duration_seconds, 2),
        "silence_seconds": round(silence_seconds, 2),
        "speech_seconds": round(max(0, duration_seconds - silence_seconds), 2),
        "silence_ratio": round(silence_seconds / max(duration_seconds, 0.01), 4),
        "long_pause_count": sum(pause >= 2 for pause in pauses),
        "longest_pause_seconds": round(max(pauses, default=0), 2),
        "method": "ffmpeg amplitude threshold; background noise may affect measurements",
    }


def transcribe_windows(audio_path, windows, questions, duration_seconds):
    from backend.services.transcription import TranscriptionService

    service = TranscriptionService()
    if not windows:
        return service.transcribe(audio_path)
    responses = {}
    for window in windows:
        index = int(window["question_index"])
        if index >= len(questions) or questions[index].get("response_type", "spoken") != "spoken":
            continue
        start = float(window["start_seconds"])
        end = min(float(window["end_seconds"]), duration_seconds)
        if end <= start:
            responses[str(index)] = ""
            continue
        target = Path(audio_path).with_name(f"answer_{index}.mp3")
        subprocess.run([
            "ffmpeg", "-y", "-i", str(audio_path), "-ss", str(start), "-t", str(end - start),
            "-vn", str(target),
        ], check=True, capture_output=True, timeout=120)
        responses[str(index)] = service.transcribe(target).get("text", "").strip()
    return {"text": " ".join(responses.values()), "question_transcripts": responses, "words": []}


def answer_activity(audio_path, windows, questions, duration_seconds):
    if not windows:
        return audio_activity(audio_path, duration_seconds)
    metrics = []
    for window in windows:
        index = int(window["question_index"])
        if index >= len(questions) or questions[index].get("response_type", "spoken") != "spoken":
            continue
        start, end = float(window["start_seconds"]), min(float(window["end_seconds"]), duration_seconds)
        if end - start < 0.1:
            continue
        target = Path(audio_path).with_name(f"answer_{index}.mp3")
        if not target.exists():
            subprocess.run(["ffmpeg", "-y", "-i", str(audio_path), "-ss", str(start), "-t", str(end - start), str(target)], check=True, capture_output=True, timeout=120)
        metrics.append(audio_activity(target, end - start))
    total = sum(item["duration_seconds"] for item in metrics)
    silence = sum(item["silence_seconds"] for item in metrics)
    return {"duration_seconds": total, "silence_seconds": silence,
            "speech_seconds": sum(item["speech_seconds"] for item in metrics),
            "silence_ratio": silence / max(total, 0.01),
            "long_pause_count": sum(item["long_pause_count"] for item in metrics),
            "longest_pause_seconds": max((item["longest_pause_seconds"] for item in metrics), default=0),
            "method": "Recorded spoken answer windows; thinking and typed-answer time excluded"}
