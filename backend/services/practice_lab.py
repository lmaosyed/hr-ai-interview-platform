import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.core.config import get_settings
from backend.services.llm import LLMService
from backend.services.scoring import (
    DIFFICULTY_WEIGHTS,
    build_explainability,
    build_highlight_moments,
    build_question_rationale,
    build_session_content_reasons,
    build_timeline_events,
    build_transcript_timestamps,
    count_transcript_words,
    count_filler_words,
    compute_answer_quality,
    compute_overall_score,
    derive_hire_signal,
    derive_risk_level,
    score_confidence,
    score_integrity,
)
from backend.services.transcription import TranscriptionService


settings = get_settings()


def prepare_audio_file(source_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-acodec",
        "mp3",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True)


def build_gaze_summary(gaze_payload: list[dict[str, Any]]) -> dict[str, Any]:
    sample_count = len(gaze_payload)
    if not sample_count:
        return {
            "on_screen_ratio": 0.0,
            "deviation_frequency": 0.0,
            "longest_off_screen_streak": 0,
            "longest_off_screen_streak_seconds": 0.0,
            "deviation_count": 0,
            "face_missing_count": 0,
            "face_missing_ratio": 0.0,
            "sample_count": 0,
        }

    on_screen_count = 0
    longest_streak = 0
    current_streak = 0
    deviation_count = 0
    face_missing_count = 0

    for item in gaze_payload:
        confidence = float(item.get("confidence", 0.8))
        face_missing = confidence < 0.3
        is_on_screen = bool(item.get("is_on_screen", item.get("direction") == "center")) and not face_missing
        if face_missing:
            face_missing_count += 1
        if is_on_screen:
            on_screen_count += 1
            current_streak = 0
        else:
            deviation_count += 1
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)

    return {
        "on_screen_ratio": round(on_screen_count / sample_count, 4),
        "deviation_frequency": round(deviation_count / sample_count, 4),
        "longest_off_screen_streak": round(longest_streak * 0.5, 2),
        "longest_off_screen_streak_seconds": round(longest_streak * 0.5, 2),
        "deviation_count": deviation_count,
        "face_missing_count": face_missing_count,
        "face_missing_ratio": round(face_missing_count / sample_count, 4),
        "sample_count": sample_count,
    }


def split_transcript_by_question(
    *,
    transcript: str,
    questions: list[dict[str, Any]],
    typed_answers: list[dict[str, Any]],
    time_limit_per_question: int | None,
    duration_seconds: int,
    answer_windows: list[dict] | None = None,
    question_transcripts: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    windows = {int(item["question_index"]): item for item in (answer_windows or [])}
    typed_answers_lookup = {
        int(item.get("question_index", -1)): str(item.get("answer_text", "")).strip()
        for item in typed_answers
        if isinstance(item, dict)
    }

    words = transcript.split()
    chunk_size = max(1, len(words) // max(1, len(questions))) if words else 1
    base_durations = [
        int(question.get("time_limit_seconds") or time_limit_per_question or 120)
        for question in questions
    ]
    total_base_duration = max(sum(base_durations), 1)
    actual_duration = max(duration_seconds or total_base_duration, 1)
    duration_scale = actual_duration / total_base_duration
    segments: list[dict[str, Any]] = []
    cursor_seconds = 0.0

    for index, question in enumerate(questions):
        start = index * chunk_size
        end = (index + 1) * chunk_size if index < len(questions) - 1 else len(words)
        spoken_segment = " ".join(words[start:end]).strip() if words else ""
        response_type = question.get("response_type", "spoken")
        window = windows.get(index)
        if window and question_transcripts is not None:
            spoken_segment = question_transcripts.get(str(index), "")
        if response_type in {"text", "code"}:
            transcript_segment = typed_answers_lookup.get(index, "").strip() or "No answer captured."
        else:
            transcript_segment = spoken_segment or "No transcript captured."
        difficulty = question.get("difficulty", "medium")
        segment_duration = int(base_durations[index] * duration_scale)
        segment_start_seconds = round(cursor_seconds, 2)
        cursor_seconds += segment_duration
        segment_end_seconds = round(cursor_seconds, 2)
        if window:
            segment_start_seconds = float(window["start_seconds"])
            segment_end_seconds = float(window["end_seconds"])
            segment_duration = max(0, int(segment_end_seconds - segment_start_seconds))
        segments.append(
            {
                "question_index": index,
                "question_text": question["text"],
                "transcript": transcript_segment,
                "duration_seconds": segment_duration,
                "difficulty_weight": float(DIFFICULTY_WEIGHTS.get(difficulty, 1.0) * question.get("weight", 1.0)),
                "difficulty": difficulty,
                "response_type": response_type,
                "helper_text": question.get("helper_text"),
                "evaluation_focus": question.get("evaluation_focus"),
                "ideal_answer_traits": question.get("ideal_answer_traits", []),
                "red_flag_points": question.get("red_flag_points", []),
                "starter_code": question.get("starter_code"),
                "transcript_start_seconds": segment_start_seconds,
                "transcript_end_seconds": segment_end_seconds,
            }
        )
    return segments


async def score_question_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    llm = LLMService()
    rows: list[dict[str, Any]] = []
    for segment in segments:
        result = await llm.score_answer(
            segment["question_text"],
            segment["transcript"],
            response_type=str(segment.get("response_type", "spoken")),
            helper_text=segment.get("helper_text"),
            evaluation_focus=segment.get("evaluation_focus"),
            ideal_answer_traits=segment.get("ideal_answer_traits"),
            red_flag_points=segment.get("red_flag_points"),
        )
        answer_quality_score = round(
            (
                float(result["relevance"]) * 0.4
                + float(result["depth"]) * 0.4
                + float(result["communication"]) * 0.2
            ),
            2,
        )
        confidence_proxy, _ = score_confidence(segment["transcript"], max(1, segment["duration_seconds"]), 0, 1)
        score_rationale = build_question_rationale(
            question_text=segment["question_text"],
            transcript=segment["transcript"],
            relevance_score=float(result["relevance"]),
            depth_score=float(result["depth"]),
            communication_score=float(result["communication"]),
            helper_text=segment.get("helper_text"),
            evaluation_focus=segment.get("evaluation_focus"),
            ideal_answer_traits=segment.get("ideal_answer_traits"),
            red_flag_points=segment.get("red_flag_points"),
        )
        highlight_moments = build_highlight_moments(
            segment["transcript"],
            float(segment["transcript_start_seconds"]),
            float(segment["transcript_end_seconds"]),
            str(result.get("summary", "")),
        )
        transcript_timestamps = build_transcript_timestamps(
            segment["transcript"],
            float(segment["transcript_start_seconds"]),
            float(segment["transcript_end_seconds"]),
        )
        rows.append(
            {
                "id": segment["question_index"] + 1,
                "question_index": segment["question_index"],
                "question_text": segment["question_text"],
                "response_type": segment.get("response_type"),
                "helper_text": segment.get("helper_text"),
                "transcript": segment["transcript"],
                "answer_quality_score": answer_quality_score,
                "relevance_score": float(result["relevance"]),
                "depth_score": float(result["depth"]),
                "communication_score": float(result["communication"]),
                "confidence_score": confidence_proxy,
                "duration_seconds": int(segment["duration_seconds"]),
                "difficulty_weight": float(segment["difficulty_weight"]),
                "ai_summary": str(result.get("summary", "")),
                "transcript_start_seconds": float(segment["transcript_start_seconds"]),
                "transcript_end_seconds": float(segment["transcript_end_seconds"]),
                "score_rationale": score_rationale,
                "highlight_moments": highlight_moments,
                "transcript_timestamps": transcript_timestamps,
            }
        )
    return rows


async def summarize_practice_session(
    *,
    answer_quality: float,
    confidence: float,
    integrity: float,
    communication: float,
    flag_count: int,
    summaries_list: list[str],
) -> dict[str, Any]:
    llm = LLMService()
    return await llm.summarize_session(
        answer_quality=answer_quality,
        confidence=confidence,
        integrity=integrity,
        communication=communication,
        flag_count=flag_count,
        summaries_list=summaries_list,
    )


def load_transcript(
    *,
    transcript_override: str | None,
    audio_path: Path,
) -> tuple[str, str]:
    override = (transcript_override or "").strip()
    if override:
        return override, "browser"

    transcription_service = TranscriptionService()
    payload = transcription_service.transcribe(audio_path)
    transcript = str(payload.get("text", "")).strip()
    provider_name = transcription_service.provider_name
    if transcript:
        return transcript, provider_name
    return "", provider_name


def build_typed_responses_payload(
    typed_answers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "question_index": int(item.get("question_index", index)),
            "question_text": str(item.get("question_text", "")),
            "response_type": str(item.get("response_type", "text")),
            "answer_text": str(item.get("answer_text", "")),
            "helper_text": item.get("helper_text"),
            "starter_code": item.get("starter_code"),
        }
        for index, item in enumerate(typed_answers)
        if isinstance(item, dict)
    ]


def build_integrity_rows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": index + 1,
            "event_type": str(event.get("event_type", "tab_switch")),
            "timestamp_seconds": float(event.get("timestamp_seconds", 0)),
            "duration_seconds": float(event.get("duration_seconds", 0)),
            "severity": str(event.get("severity", "medium")),
            "description": str(event.get("description", "Integrity event")),
        }
        for index, event in enumerate(events)
    ]


def persist_practice_report(processed_dir: Path, payload: dict[str, Any]) -> None:
    processed_dir.mkdir(parents=True, exist_ok=True)
    (processed_dir / "practice_report.json").write_text(
        json.dumps(payload, indent=2, default=str),
        encoding="utf-8",
    )


def build_scored_summary_payload(
    *,
    transcript: str,
    duration_seconds: int,
    gaze_summary: dict[str, Any],
    integrity_events: list[dict[str, Any]],
    question_scores: list[dict[str, Any]],
    session_summary: dict[str, Any],
    audio_metrics: dict | None = None,
) -> dict[str, Any]:
    communication_score = round(
        sum(item["communication_score"] for item in question_scores) / max(1, len(question_scores)),
        2,
    )
    answer_quality_value = compute_answer_quality(question_scores)
    total_allowed_duration = max(sum(item["duration_seconds"] for item in question_scores), 1)
    answer_duration_ratio = duration_seconds / total_allowed_duration
    confidence_value, confidence_breakdown = score_confidence(
        transcript=transcript,
        duration_seconds=duration_seconds,
        gaze_on_screen_ratio=float(gaze_summary["on_screen_ratio"]),
        answer_duration_ratio=answer_duration_ratio,
        audio_metrics=audio_metrics,
    )

    tab_switches = sum(1 for item in integrity_events if item["event_type"] == "tab_switch")
    copy_paste_events = sum(1 for item in integrity_events if item["event_type"] == "copy_paste")
    screen_inactive_events = sum(1 for item in integrity_events if item["event_type"] == "screen_inactive")
    off_screen_events = sum(1 for item in integrity_events if item["event_type"] == "off_screen")
    integrity_value = score_integrity(
        events=integrity_events,
        gaze_deviation_frequency=float(gaze_summary["deviation_frequency"]),
        longest_off_screen_streak_seconds=float(gaze_summary.get("longest_off_screen_streak_seconds", 0.0)),
        face_missing_ratio=float(gaze_summary.get("face_missing_ratio", 0.0)),
    )
    overall_score = compute_overall_score(
        answer_quality=answer_quality_value,
        confidence=confidence_value,
        communication=communication_score,
    )
    hire_signal = derive_hire_signal(overall_score, integrity_value)
    risk_level = derive_risk_level(integrity_value, len(integrity_events))
    filler_word_count = count_filler_words(transcript)
    word_count = count_transcript_words(transcript)
    explainability = build_explainability(
        confidence_breakdown=confidence_breakdown,
        filler_word_count=filler_word_count,
        word_count=word_count,
        tab_switches=tab_switches,
        copy_paste_events=copy_paste_events,
        gaze_deviation_count=sum(event["event_type"] == "gaze_deviation" for event in integrity_events),
        screen_inactive_events=screen_inactive_events,
        off_screen_events=off_screen_events,
        content_reasons=build_session_content_reasons(
            answer_quality=answer_quality_value,
            communication=communication_score,
            question_summaries=[item["ai_summary"] for item in question_scores],
        ),
    )
    if not gaze_summary.get("sample_count"):
        explainability["integrity_reasons"].append("No camera attention samples were captured; gaze monitoring was unavailable.")
    timeline_events = build_timeline_events(
        integrity_events=integrity_events,
        question_summaries=[item["ai_summary"] for item in question_scores],
        question_highlights=[
            highlight
            for item in question_scores
            for highlight in item.get("highlight_moments", [])
        ],
    )

    return {
        "overall_score": overall_score,
        "answer_quality_score": answer_quality_value,
        "confidence_score": confidence_value,
        "integrity_score": integrity_value,
        "communication_score": communication_score,
        "hire_signal": hire_signal,
        "ai_summary": str(session_summary.get("summary", "")),
        "risk_level": risk_level,
        "explainability": explainability,
        "score_breakdown": confidence_breakdown,
        "timeline_events": timeline_events,
        "scored_at": datetime.now(timezone.utc).isoformat(),
    }
