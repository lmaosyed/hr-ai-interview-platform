import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool
import httpx
from backend.schemas.capture import CaptureEvent, GazeSample, parse_capture_json, parse_answer_windows, validate_capture_times
from backend.services.audio import audio_activity, answer_activity, transcribe_windows

from backend.core.config import get_settings
from backend.schemas.candidate import IntegrityEventRead, QuestionResponseRead, SessionScoreSummary, TypedResponseRead
from backend.schemas.job import JobQuestion
from backend.schemas.lab import EvaluationLabResponse, PracticeLabConfig
from backend.services.practice_lab import (
    build_gaze_summary,
    build_integrity_rows,
    build_scored_summary_payload,
    build_typed_responses_payload,
    load_transcript,
    persist_practice_report,
    prepare_audio_file,
    score_question_segments,
    split_transcript_by_question,
    summarize_practice_session,
)
from backend.services.storage import ensure_storage_dirs, save_json, save_upload_file


router = APIRouter(prefix="/lab", tags=["lab"])
settings = get_settings()


@router.post("/evaluate", response_model=EvaluationLabResponse)
async def evaluate_practice_interview(
    lab_context: str = Form(...),
    started_at: datetime = Form(...),
    ended_at: datetime = Form(...),
    duration_seconds: int = Form(...),
    gaze_data: str = Form(...),
    integrity_events: str = Form(...),
    typed_answers: str = Form(default="[]"),
    answer_windows: str = Form(default="[]"),
    transcript_override: str | None = Form(default=None),
    video: UploadFile = File(...),
    screen: UploadFile = File(...),
    audio: UploadFile = File(...),
) -> EvaluationLabResponse:
    ensure_storage_dirs()
    practice_id = uuid4().hex[:12]
    raw_dir = Path("storage") / "raw" / "lab" / practice_id
    processed_dir = Path("storage") / "processed" / "lab" / practice_id

    try:
        config = PracticeLabConfig.model_validate_json(lab_context)
        validate_capture_times(started_at, ended_at, duration_seconds)
        gaze_payload = parse_capture_json(gaze_data, "gaze data", GazeSample)
        integrity_payload = parse_capture_json(integrity_events, "integrity events", CaptureEvent)
        typed_answers_payload = parse_capture_json(typed_answers, "typed answers")
        windows = parse_answer_windows(answer_windows, duration_seconds)
        if not config.questions:
            raise ValueError("Add at least one interview question.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid practice lab payload: {exc}",
        ) from exc

    video_path = raw_dir / "webcam.webm"
    screen_path = raw_dir / "screen.webm"
    audio_path = raw_dir / "audio.webm"
    extracted_audio_path = processed_dir / "audio.mp3"

    try:
        await save_upload_file(video, video_path)
        await save_upload_file(screen, screen_path)
        await save_upload_file(audio, audio_path)
        await save_json(gaze_payload, raw_dir / "gaze.json")
        await save_json(integrity_payload, raw_dir / "integrity_events.json")
        await save_json(typed_answers_payload, raw_dir / "typed_answers.json")
        await save_json(windows, raw_dir / "answer_windows.json")
        await run_in_threadpool(prepare_audio_file, audio_path, extracted_audio_path)
        metrics = await run_in_threadpool(audio_activity, extracted_audio_path, duration_seconds)
        if windows:
            payload = await run_in_threadpool(transcribe_windows, extracted_audio_path, windows,
                                              [q.model_dump() for q in config.questions], duration_seconds)
            transcript = payload["text"]
            from backend.services.transcription import TranscriptionService
            provider_used = TranscriptionService().provider_name
        else:
            transcript, provider_used = await run_in_threadpool(load_transcript,
                transcript_override=transcript_override, audio_path=extracted_audio_path)
            payload = {}
        if metrics["speech_seconds"] < 0.5:
            transcript = ""
        metrics = await run_in_threadpool(answer_activity, extracted_audio_path, windows,
                                         [q.model_dump() for q in config.questions], duration_seconds)
        if metrics["speech_seconds"] < 0.5:
            provider_used = "silence_detector"
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Transcription service is unavailable. Check your Gemini key, model, and free quota.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read the recording. Ensure the microphone records audible sound and retry.",
        ) from exc

    segments = split_transcript_by_question(
        transcript=transcript,
        questions=[question.model_dump() for question in config.questions],
        typed_answers=typed_answers_payload if isinstance(typed_answers_payload, list) else [],
        time_limit_per_question=config.time_limit_per_question,
        duration_seconds=duration_seconds,
        answer_windows=windows,
        question_transcripts=payload.get("question_transcripts"),
    )
    try:
        question_scores = await score_question_segments(segments)
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from exc
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(502, "AI evaluation is unavailable. Check the provider key/model and free quota, then retry.") from exc
    gaze_summary = build_gaze_summary(gaze_payload if isinstance(gaze_payload, list) else [])
    integrity_rows = build_integrity_rows(integrity_payload if isinstance(integrity_payload, list) else [])

    average_relevance = round(
        sum(item["relevance_score"] for item in question_scores) / max(1, len(question_scores)),
        2,
    )
    average_depth = round(
        sum(item["depth_score"] for item in question_scores) / max(1, len(question_scores)),
        2,
    )
    average_communication = round(
        sum(item["communication_score"] for item in question_scores) / max(1, len(question_scores)),
        2,
    )

    scored_summary = build_scored_summary_payload(
        transcript=transcript,
        duration_seconds=duration_seconds,
        gaze_summary=gaze_summary,
        integrity_events=integrity_rows,
        question_scores=question_scores,
        session_summary={},
        audio_metrics=metrics,
    )
    try:
        session_summary = await summarize_practice_session(
            answer_quality=scored_summary["answer_quality_score"],
            confidence=scored_summary["confidence_score"],
            integrity=scored_summary["integrity_score"],
            communication=scored_summary["communication_score"],
            flag_count=len(integrity_rows),
            summaries_list=[item["ai_summary"] for item in question_scores],
        )
        scored_summary["ai_summary"] = str(session_summary.get("summary", ""))
    except (httpx.HTTPError, ValueError, RuntimeError):
        scored_summary["ai_summary"] = "Question scores are available. The AI summary service is currently unavailable."
    typed_response_rows = build_typed_responses_payload(
        typed_answers_payload if isinstance(typed_answers_payload, list) else [],
    )

    persist_practice_report(
        processed_dir,
        {
            "practice_id": practice_id,
            "config": config.model_dump(mode="json"),
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "duration_seconds": duration_seconds,
            "transcript": transcript,
            "transcription_provider": provider_used,
            "question_responses": question_scores,
            "typed_responses": typed_response_rows,
            "integrity_events": integrity_rows,
            "session_score": {
                **scored_summary,
                "hire_signal": getattr(scored_summary["hire_signal"], "value", scored_summary["hire_signal"]),
                "risk_level": getattr(scored_summary["risk_level"], "value", scored_summary["risk_level"]),
            },
            "gaze_summary": gaze_summary,
            "audio_metrics": metrics,
        },
    )

    return EvaluationLabResponse(
        practice_id=practice_id,
        title=config.title,
        category=config.category,
        description=config.description,
        time_mode=config.time_mode,
        time_limit_per_question=config.time_limit_per_question,
        transcript=transcript,
        summary=scored_summary["ai_summary"],
        relevance_score=average_relevance,
        depth_score=average_depth,
        communication_score=average_communication,
        answer_quality_score=scored_summary["answer_quality_score"],
        confidence_score=scored_summary["confidence_score"],
        duration_seconds=duration_seconds,
        demo_mode=settings.demo_mode,
        transcription_provider=provider_used,
        question_responses=[QuestionResponseRead.model_validate(item) for item in question_scores],
        typed_responses=[TypedResponseRead.model_validate(item) for item in typed_response_rows],
        integrity_events=[IntegrityEventRead.model_validate(item) for item in integrity_rows],
        session_score=SessionScoreSummary.model_validate(scored_summary),
        gaze_summary=gaze_summary,
        audio_metrics=metrics,
        questions=[JobQuestion.model_validate(question.model_dump()) for question in config.questions],
    )
