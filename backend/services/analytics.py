from collections import Counter

from backend.core.enums import HireSignal
from backend.models.candidate import Candidate
from backend.models.integrity_event import IntegrityEvent
from backend.models.session import Session
from backend.models.session_score import SessionScore
from backend.schemas.analytics import (
    AnalyticsMetric,
    HistogramBucket,
    HireSignalBreakdown,
    IntegrityFrequency,
    JobAnalyticsResponse,
)


def build_histogram(scores: list[float]) -> list[HistogramBucket]:
    buckets = [
        ("0-39", 0),
        ("40-54", 0),
        ("55-69", 0),
        ("70-79", 0),
        ("80-100", 0),
    ]
    counts = {label: count for label, count in buckets}
    for score in scores:
        if score < 40:
            counts["0-39"] += 1
        elif score < 55:
            counts["40-54"] += 1
        elif score < 70:
            counts["55-69"] += 1
        elif score < 80:
            counts["70-79"] += 1
        else:
            counts["80-100"] += 1
    return [HistogramBucket(range_label=label, count=count) for label, count in counts.items()]


def build_job_analytics(candidates: list[Candidate]) -> JobAnalyticsResponse:
    session_scores: list[SessionScore] = []
    integrity_events: list[IntegrityEvent] = []

    for candidate in candidates:
        if candidate.sessions:
            latest_session: Session = sorted(candidate.sessions, key=lambda item: item.id)[-1]
            if latest_session.session_score:
                session_scores.append(latest_session.session_score)
            integrity_events.extend(latest_session.integrity_events)

    if session_scores:
        averages = [
            AnalyticsMetric(
                label="Answer Quality",
                value=round(sum(score.answer_quality_score for score in session_scores) / len(session_scores), 2),
            ),
            AnalyticsMetric(
                label="Confidence",
                value=round(sum(score.confidence_score for score in session_scores) / len(session_scores), 2),
            ),
            AnalyticsMetric(
                label="Integrity",
                value=round(sum(score.integrity_score for score in session_scores) / len(session_scores), 2),
            ),
            AnalyticsMetric(
                label="Communication",
                value=round(sum(score.communication_score for score in session_scores) / len(session_scores), 2),
            ),
        ]
        score_distribution = build_histogram([score.overall_score for score in session_scores])
        hire_counts = Counter(score.hire_signal for score in session_scores)
    else:
        averages = [
            AnalyticsMetric(label="Answer Quality", value=0),
            AnalyticsMetric(label="Confidence", value=0),
            AnalyticsMetric(label="Integrity", value=0),
            AnalyticsMetric(label="Communication", value=0),
        ]
        score_distribution = build_histogram([])
        hire_counts = Counter()

    integrity_counts = Counter(event.event_type.value for event in integrity_events)
    integrity_frequency = [
        IntegrityFrequency(event_type=event_type, count=count)
        for event_type, count in integrity_counts.items()
    ]
    hire_signal_breakdown = [
        HireSignalBreakdown(signal=signal, count=hire_counts.get(signal, 0))
        for signal in HireSignal
    ]

    return JobAnalyticsResponse(
        average_scores=averages,
        score_distribution=score_distribution,
        integrity_flag_frequency=integrity_frequency,
        hire_signal_breakdown=hire_signal_breakdown,
    )
