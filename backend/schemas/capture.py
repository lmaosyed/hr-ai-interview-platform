import json
import math
from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.core.enums import IntegrityEventType, SeverityLevel


class GazeSample(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    timestamp_seconds: float = Field(ge=0)
    gaze_x: float
    gaze_y: float
    is_on_screen: bool
    confidence: float = Field(ge=0, le=1)


class CaptureEvent(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    event_type: IntegrityEventType
    timestamp_seconds: float = Field(ge=0)
    duration_seconds: float = Field(default=0, ge=0)
    severity: SeverityLevel
    description: str = Field(min_length=1, max_length=2000)


class AnswerWindow(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    question_index: int = Field(ge=0)
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)


def parse_answer_windows(raw: str, duration: int) -> list[dict]:
    windows = parse_capture_json(raw, "answer windows", AnswerWindow)
    seen = set()
    previous_end = 0.0
    for item in windows:
        if item["question_index"] in seen or not previous_end <= item["start_seconds"] <= item["end_seconds"] <= duration + 1:
            raise HTTPException(422, "Answer windows must be ordered, non-overlapping, and within the recording.")
        seen.add(item["question_index"])
        previous_end = item["end_seconds"]
    return windows


def parse_capture_json(raw: str, label: str, schema: type[BaseModel] | None = None) -> list[dict]:
    try:
        data = json.loads(raw)
        if not isinstance(data, list) or len(data) > 30000 or any(not isinstance(row, dict) for row in data):
            raise ValueError("Expected an array of objects (maximum 30,000 entries).")
        return [schema.model_validate(row).model_dump(mode="json") for row in data] if schema else data
    except (ValueError, TypeError, ValidationError) as exc:
        raise HTTPException(422, f"Invalid {label}: {str(exc)[:300]}") from None


def validate_capture_times(start: datetime, end: datetime, duration: int) -> None:
    if start.tzinfo is None or end.tzinfo is None or end <= start or not 1 <= duration <= 14400:
        raise HTTPException(422, "Recording timestamps must include timezone and span 1 second to 4 hours.")
    if abs((end - start).total_seconds() - duration) > 5:
        raise HTTPException(422, "Recording duration does not match its start and end times.")
