from datetime import datetime

from pydantic import Field

from backend.core.enums import InterviewTimeMode, QuestionDifficulty, QuestionResponseType
from backend.schemas.common import ORMModel


class JobQuestion(ORMModel):
    text: str = Field(..., min_length=1)
    response_type: QuestionResponseType = QuestionResponseType.spoken
    helper_text: str | None = None
    evaluation_focus: str | None = None
    ideal_answer_traits: list[str] = Field(default_factory=list)
    red_flag_points: list[str] = Field(default_factory=list)
    starter_code: str | None = None
    time_limit_seconds: int | None = Field(default=120, ge=30, le=3600)
    difficulty: QuestionDifficulty = QuestionDifficulty.medium
    weight: float = Field(default=1.0, gt=0, le=10, allow_inf_nan=False)


class JobCreate(ORMModel):
    hr_user_id: int
    title: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    questions: list[JobQuestion] = Field(min_length=1, max_length=30)
    time_mode: InterviewTimeMode = InterviewTimeMode.fixed
    time_limit_per_question: int | None = Field(default=120, ge=30, le=3600)


class JobUpdate(JobCreate):
    pass


class JobRead(JobCreate):
    id: int
    created_at: datetime


class JobListItem(ORMModel):
    id: int
    hr_user_id: int
    title: str
    category: str
    description: str
    time_mode: InterviewTimeMode
    time_limit_per_question: int | None
    created_at: datetime
    candidate_count: int = 0


class JobQuestionQualityCheckRequest(ORMModel):
    question_text: str = Field(..., min_length=1)
    response_type: QuestionResponseType = QuestionResponseType.spoken
    helper_text: str | None = None
    evaluation_focus: str | None = None
    ideal_answer_traits: list[str] = Field(default_factory=list)
    red_flag_points: list[str] = Field(default_factory=list)


class JobQuestionQualityCheckResponse(ORMModel):
    overall_score: float
    rating: str
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    suggested_rewrite: str | None = None
