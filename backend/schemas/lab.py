from typing import Any

from backend.core.enums import InterviewTimeMode
from backend.schemas.candidate import (
    IntegrityEventRead,
    QuestionResponseRead,
    SessionScoreSummary,
    TypedResponseRead,
)
from backend.schemas.common import ORMModel
from backend.schemas.job import JobQuestion


class EvaluationLabResponse(ORMModel):
    practice_id: str
    title: str
    category: str
    description: str
    time_mode: InterviewTimeMode
    time_limit_per_question: int | None
    transcript: str
    summary: str
    relevance_score: float
    depth_score: float
    communication_score: float
    answer_quality_score: float
    confidence_score: float
    duration_seconds: int
    demo_mode: bool
    transcription_provider: str
    question_responses: list[QuestionResponseRead]
    typed_responses: list[TypedResponseRead]
    integrity_events: list[IntegrityEventRead]
    session_score: SessionScoreSummary
    gaze_summary: dict[str, Any]
    audio_metrics: dict[str, Any] = {}
    questions: list[JobQuestion]


class PracticeLabConfig(ORMModel):
    title: str
    category: str
    description: str
    time_mode: InterviewTimeMode
    time_limit_per_question: int | None
    questions: list[JobQuestion]
