from collections import Counter
import re
from typing import Any

from backend.core.enums import HireSignal, RiskLevel


FILLER_WORDS = ("um", "uh", "like", "you know", "basically", "actually")
DETAIL_MARKERS = (
    "because",
    "for example",
    "for instance",
    "specifically",
    "implemented",
    "designed",
    "optimized",
    "measured",
    "improved",
    "database",
    "query",
    "index",
    "api",
    "pipeline",
    "tradeoff",
    "latency",
    "caching",
    "testing",
)
DIFFICULTY_WEIGHTS = {
    "easy": 0.9,
    "medium": 1.0,
    "hard": 1.15,
}
EVENT_BASE_PENALTIES = {
    "tab_switch": 7.0,
    "copy_paste": 20.0,
    "screen_inactive": 14.0,
    "gaze_deviation": 4.5,
    "off_screen": 8.0,
    "audio_anomaly": 6.0,
    "long_pause": 5.0,
}
SEVERITY_MULTIPLIERS = {
    "low": 0.75,
    "medium": 1.0,
    "high": 1.35,
}


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def seconds_to_mmss(seconds: float | int | None) -> str:
    if seconds is None:
        return "00:00"
    whole_seconds = max(0, int(round(float(seconds))))
    minutes, remaining_seconds = divmod(whole_seconds, 60)
    return f"{minutes:02d}:{remaining_seconds:02d}"


def compute_answer_quality(question_scores: list[dict[str, Any]]) -> float:
    if not question_scores:
        return 0.0
    total_weight = sum(item.get("difficulty_weight", 1.0) for item in question_scores) or 1.0
    weighted_scores = [
        item["answer_quality_score"] * item.get("difficulty_weight", 1.0)
        for item in question_scores
    ]
    return round(sum(weighted_scores) / total_weight, 2)


def count_filler_words(text: str) -> int:
    lowered = text.lower()
    return sum(len(re.findall(r"\b" + re.escape(word) + r"\b", lowered)) for word in FILLER_WORDS)


def count_transcript_words(text: str) -> int:
    if text.strip().lower() in {"no transcript captured.", "no answer captured."}:
        return 0
    return len(re.findall(r"\b[\w']+\b", text))


def calculate_words_per_minute(text: str, duration_seconds: int) -> float:
    words = count_transcript_words(text)
    if duration_seconds <= 0:
        return 0.0
    return round(words / (duration_seconds / 60), 2)


def score_confidence(
    transcript: str,
    duration_seconds: int,
    gaze_on_screen_ratio: float,
    answer_duration_ratio: float,
    audio_metrics: dict | None = None,
) -> tuple[float, dict[str, float]]:
    filler_words = count_filler_words(transcript)
    if audio_metrics:
        duration_seconds = max(1, float(audio_metrics.get("duration_seconds", duration_seconds)))
    word_count = count_transcript_words(transcript)
    sentence_count = len(_split_sentences(transcript)) if word_count else 0
    wpm = calculate_words_per_minute(transcript, duration_seconds)

    if word_count == 0:
        pace_score = 0.0
    elif word_count < 8:
        pace_score = float(min(35, word_count * 4))
    else:
        pace_score = max(0, 100 - abs(145 - wpm) * 0.7)

    if word_count == 0:
        filler_score = 0.0
    elif word_count < 8:
        filler_score = max(25, 55 - filler_words * 5)
    else:
        filler_score = max(0, 100 - filler_words * 4)

    # This is an observable delivery measure, not an inference about personality.
    # Face position belongs exclusively to the proctoring report.
    response_substance = max(
        0,
        min(100, word_count * 1.7 + sentence_count * 10 - filler_words * 2.5),
    )
    delivery_consistency = max(0, 100 - abs(1.0 - answer_duration_ratio) * 55)
    if word_count < 12:
        delivery_consistency = min(delivery_consistency, word_count * 4)
    elif wpm < 70:
        delivery_consistency = max(25, delivery_consistency - 20)

    if audio_metrics:
        spoken_seconds = float(audio_metrics.get("speech_seconds", 0))
        if spoken_seconds < 0.5:
            word_count = 0
        silence_ratio = float(audio_metrics.get("silence_ratio", 0))
        pause_score = max(0, 100 - max(0, silence_ratio - 0.20) * 125
                          - float(audio_metrics.get("long_pause_count", 0)) * 5)
        delivery_consistency = pause_score
    if word_count == 0:
        return 0.0, {"speech_pace": 0.0, "filler_words": 0.0, "response_substance": 0.0, "delivery_consistency": 0.0}
    breakdown = {
        "speech_pace": round(pace_score, 2),
        "filler_words": round(filler_score, 2),
        "response_substance": round(response_substance, 2),
        "delivery_consistency": round(delivery_consistency, 2),
    }
    composite = round(
        pace_score * 0.25
        + filler_score * 0.15
        + response_substance * 0.30
        + delivery_consistency * 0.30,
        2,
    )
    return round(min(composite, min(100, word_count * 5)), 2), breakdown


def _extract_duration_seconds(event: dict[str, Any]) -> float:
    explicit_duration = event.get("duration_seconds")
    if explicit_duration is not None:
        try:
            return max(0.0, float(explicit_duration))
        except (TypeError, ValueError):
            return 0.0
    description = str(event.get("description", ""))
    match = re.search(r"for (\d+(?:\.\d+)?) seconds", description)
    if not match:
        return 0.0
    return float(match.group(1))


def score_integrity(
    events: list[dict[str, Any]],
    gaze_deviation_frequency: float,
    longest_off_screen_streak_seconds: float = 0.0,
    face_missing_ratio: float = 0.0,
) -> float:
    integrity = 100.0
    gaze_penalty = 0.0
    for event in events:
        event_type = str(event.get("event_type", ""))
        severity = str(event.get("severity", "medium"))
        base_penalty = EVENT_BASE_PENALTIES.get(event_type, 4.0)
        severity_multiplier = SEVERITY_MULTIPLIERS.get(severity, 1.0)
        duration_seconds = _extract_duration_seconds(event)
        # Only qualified episodes count. Raw snapshots also contain normal screen
        # scanning, blinks, calibration frames, and tracking failures.
        if event_type in {"gaze_deviation", "off_screen"}:
            if duration_seconds >= 3:
                gaze_penalty += min(12, 2 + max(0, duration_seconds - 3) * 0.7)
            continue
        if event_type in {"tab_switch", "screen_inactive"} and 0 < duration_seconds < 1.5:
            continue
        integrity -= base_penalty * severity_multiplier
        if duration_seconds > 0 and event_type in {"tab_switch", "screen_inactive", "gaze_deviation", "off_screen"}:
            integrity -= min(18.0, duration_seconds * 1.6)

    integrity -= min(30, gaze_penalty)
    return round(max(0, integrity), 2)


# The main score is now intentionally content-first. Integrity is tracked as a
# separate risk signal so a suspicious session does not distort the answer
# quality score itself, while still remaining visible to HR reviewers.
def compute_overall_score(
    answer_quality: float,
    confidence: float,
    communication: float,
) -> float:
    overall = (
        answer_quality * 0.55
        + confidence * 0.25
        + communication * 0.20
    )
    return round(overall, 2)


def derive_hire_signal(overall: float, integrity: float) -> HireSignal:
    if overall >= 80:
        return HireSignal.strong
    if overall >= 70:
        return HireSignal.likely
    if overall >= 55:
        return HireSignal.weak
    return HireSignal.not_recommended


def derive_risk_level(integrity_score: float, flag_count: int) -> RiskLevel:
    if integrity_score < 55 or flag_count >= 6:
        return RiskLevel.high
    if integrity_score < 75 or flag_count >= 3:
        return RiskLevel.medium
    return RiskLevel.low


def build_question_rationale(
    *,
    question_text: str,
    transcript: str,
    relevance_score: float,
    depth_score: float,
    communication_score: float,
    helper_text: str | None = None,
    evaluation_focus: str | None = None,
    ideal_answer_traits: list[str] | None = None,
    red_flag_points: list[str] | None = None,
) -> dict[str, str]:
    word_count = len(transcript.split())
    overlap_words = set(re.findall(r"[a-zA-Z0-9']+", question_text.lower())) & set(
        re.findall(r"[a-zA-Z0-9']+", transcript.lower())
    )
    detail_hits = sum(transcript.lower().count(marker) for marker in DETAIL_MARKERS)
    ideal_traits = [item for item in (ideal_answer_traits or []) if item]
    red_flags = [item for item in (red_flag_points or []) if item]

    relevance_reason = (
        "The answer stayed closely aligned with the wording of the question."
        if relevance_score >= 75
        else "The answer only partially addressed the exact ask and should have been more direct."
    )
    if overlap_words:
        relevance_reason += f" Shared keywords included {', '.join(sorted(list(overlap_words))[:4])}."

    if depth_score >= 75:
        depth_reason = "The answer included concrete detail, examples, or technical specifics."
    elif word_count < 20:
        depth_reason = "The answer was short, which limited the level of detail the reviewer could credit."
    else:
        depth_reason = "The answer stayed fairly general and would benefit from more specific evidence or tradeoffs."
    if detail_hits:
        depth_reason += f" Detail markers were detected {detail_hits} time(s)."

    communication_reason = (
        "The answer sounded reasonably structured and easy to follow."
        if communication_score >= 70
        else "The answer structure was harder to follow and would benefit from a clearer beginning, middle, and end."
    )

    overall_reason_parts = []
    if helper_text:
        overall_reason_parts.append(f"HR instructions were: {helper_text}")
    if evaluation_focus:
        overall_reason_parts.append(f"Primary scoring focus: {evaluation_focus}.")
    if ideal_traits:
        overall_reason_parts.append(f"Strong answers were expected to show {', '.join(ideal_traits[:3])}.")
    if red_flags:
        overall_reason_parts.append(f"Reviewers were watching for red flags such as {', '.join(red_flags[:2])}.")
    if not overall_reason_parts:
        overall_reason_parts.append("This question used the platform's general scoring fallback because no custom rubric was provided.")

    return {
        "relevance": relevance_reason,
        "depth": depth_reason,
        "communication": communication_reason,
        "overall": " ".join(overall_reason_parts),
    }


def build_transcript_timestamps(
    transcript: str,
    start_seconds: float,
    end_seconds: float,
    *,
    max_points: int = 4,
) -> list[dict[str, Any]]:
    if count_transcript_words(transcript) == 0:
        return []
    sentences = _split_sentences(transcript)
    if not sentences:
        return []
    limited_sentences = sentences[:max_points]
    span = max(1.0, end_seconds - start_seconds)
    step = span / max(1, len(limited_sentences))
    return [
        {
            "timestamp_seconds": round(start_seconds + step * index, 2),
            "label": "Approx. " + seconds_to_mmss(start_seconds + step * index),
            "text": sentence,
        }
        for index, sentence in enumerate(limited_sentences)
    ]


def build_highlight_moments(
    transcript: str,
    start_seconds: float,
    end_seconds: float,
    ai_summary: str | None = None,
) -> list[dict[str, Any]]:
    if count_transcript_words(transcript) == 0:
        return []
    sentences = _split_sentences(transcript)
    if not sentences:
        return []
    candidates = sorted(
        sentences,
        key=lambda sentence: (
            sum(sentence.lower().count(marker) for marker in DETAIL_MARKERS),
            len(sentence),
        ),
        reverse=True,
    )
    selected = candidates[:2]
    span = max(1.0, end_seconds - start_seconds)
    step = span / max(1, len(selected) + 1)
    highlights = []
    for index, sentence in enumerate(selected, start=1):
        timestamp = round(start_seconds + step * index, 2)
        highlights.append(
            {
                "timestamp_seconds": timestamp,
                "label": "Approx. " + seconds_to_mmss(timestamp),
                "evidence": sentence,
                "description": ai_summary or "Relevant answer evidence captured in this response.",
            }
        )
    return highlights


def build_session_content_reasons(
    *,
    answer_quality: float,
    communication: float,
    question_summaries: list[str],
) -> list[str]:
    reasons: list[str] = []
    if answer_quality >= 75:
        reasons.append("Answer quality remained strong across most questions.")
    elif answer_quality >= 60:
        reasons.append("Answer quality was workable, but some responses stayed too general.")
    else:
        reasons.append("Answer quality was inconsistent and often lacked enough detail.")

    if communication >= 75:
        reasons.append("The candidate communicated ideas clearly and in a structured way.")
    else:
        reasons.append("Communication clarity varied and some answers would benefit from tighter structure.")

    if question_summaries:
        reasons.append(f"Top answer signal: {question_summaries[0]}")
    return reasons


def build_explainability(
    confidence_breakdown: dict[str, float],
    filler_word_count: int,
    word_count: int,
    tab_switches: int,
    copy_paste_events: int,
    gaze_deviation_count: int,
    screen_inactive_events: int = 0,
    off_screen_events: int = 0,
    *,
    content_reasons: list[str] | None = None,
) -> dict[str, Any]:
    confidence_reasons = []
    if confidence_breakdown.get("response_substance", 0) < 45:
        confidence_reasons.append("The response contained very little spoken or typed substance for the time available.")
    if confidence_breakdown["speech_pace"] < 60:
        confidence_reasons.append("Speech pace was outside the target range.")
    if filler_word_count > 8:
        confidence_reasons.append(f"{filler_word_count} filler words were detected.")
    if confidence_breakdown.get("delivery_consistency", 0) < 55:
        confidence_reasons.append("Limited spoken evidence or measured silent gaps reduced delivery consistency.")
    if word_count >= 30 and confidence_breakdown.get("delivery_consistency", 0) >= 70:
        confidence_reasons.append("The answer maintained enough substance throughout the allowed time.")

    integrity_reasons = []
    if tab_switches:
        integrity_reasons.append(f"{tab_switches} tab switch events were detected.")
    if screen_inactive_events:
        integrity_reasons.append(f"{screen_inactive_events} fullscreen or screen-active interruptions were detected.")
    if copy_paste_events:
        integrity_reasons.append(f"{copy_paste_events} copy or paste actions were detected.")
    if gaze_deviation_count:
        integrity_reasons.append(f"{gaze_deviation_count} sustained gaze-deviation events were logged.")
    if off_screen_events:
        integrity_reasons.append(f"{off_screen_events} face-visibility or off-screen events were logged.")

    return {
        "content_reasons": content_reasons or ["The platform used the general answer-quality rubric for this session."],
        "confidence_reasons": confidence_reasons or ["Confidence remained stable across the session."],
        "integrity_reasons": integrity_reasons or ["No major integrity anomalies were detected."],
        "score_model_note": "Scores summarize answer content and observable speech delivery. Gaze estimates are review signals and cannot establish cheating; hiring decisions remain with HR.",
    }


def build_timeline_events(
    integrity_events: list[dict[str, Any]],
    question_summaries: list[str],
    question_highlights: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    events = [
        {
            "timestamp": round(event.get("timestamp_seconds", 0), 2),
            "type": event.get("event_type", "integrity"),
            "description": event.get("description", ""),
        }
        for event in integrity_events
    ]
    for highlight in question_highlights or []:
        events.append(
            {
                "timestamp": round(float(highlight.get("timestamp_seconds", 0)), 2),
                "type": "answer_highlight",
                "description": str(highlight.get("evidence") or highlight.get("description") or ""),
            }
        )
    return sorted(events, key=lambda item: item["timestamp"])


def top_flag_descriptions(events: list[dict[str, Any]], limit: int = 2) -> list[str]:
    counter = Counter(event["event_type"] for event in events)
    return [name.replace("_", " ") for name, _ in counter.most_common(limit)]
