import asyncio
import json
import logging
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from backend.core.database import SessionLocal
from backend.core.enums import (
    IntegrityEventType,
    PipelineRunStatus,
    ProcessingStatus,
    SeverityLevel,
)
from backend.models import (
    Candidate,
    GazeSnapshot,
    IntegrityEvent,
    Job,
    PipelineRun,
    QuestionResponse,
    Session,
    SessionScore,
)
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
from backend.services.storage import load_json
from backend.services.transcription import TranscriptionService


logger = logging.getLogger(__name__)


def _storage_dir(session_id: int, layer: str) -> Path:
    return Path("storage") / layer / str(session_id)


async def _get_session_context(session_id: int) -> dict[str, Any]:
    async with SessionLocal() as db:
        query = (
            select(Session)
            .options(selectinload(Session.candidate).selectinload(Candidate.job))
            .where(Session.id == session_id)
        )
        session_obj = (await db.execute(query)).scalar_one_or_none()
        if not session_obj or not session_obj.candidate or not session_obj.candidate.job:
            raise ValueError(f"Session {session_id} not found.")
        job: Job = session_obj.candidate.job
        return {
            "session_id": session_obj.id,
            "candidate_id": session_obj.candidate_id,
            "duration_seconds": session_obj.duration_seconds or 0,
            "raw_video_path": session_obj.raw_video_path,
            "raw_audio_path": session_obj.raw_audio_path,
            "raw_gaze_path": session_obj.raw_gaze_path,
            "raw_integrity_path": session_obj.raw_integrity_path,
            "raw_answers_path": session_obj.raw_answers_path,
            "questions": job.questions,
            "time_limit_per_question": job.time_limit_per_question or 90,
            "time_mode": job.time_mode.value,
        }


def get_session_context(session_id: int) -> dict[str, Any]:
    return asyncio.run(_get_session_context(session_id))


async def _start_pipeline_run(session_id: int) -> int:
    async with SessionLocal() as db:
        session_obj = await db.get(Session, session_id)
        if not session_obj:
            raise ValueError(f"Session {session_id} not found.")
        session_obj.processing_status = ProcessingStatus.processing
        run = PipelineRun(
            session_id=session_id,
            started_at=datetime.now(timezone.utc),
            status=PipelineRunStatus.running,
            retry_count=0,
            logs="Pipeline started.",
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run.id


def start_pipeline_run(session_id: int) -> int:
    return asyncio.run(_start_pipeline_run(session_id))


async def _mark_pipeline_failed(session_id: int, failed_task: str, error_message: str) -> None:
    async with SessionLocal() as db:
        session_obj = await db.get(Session, session_id)
        if session_obj:
            session_obj.processing_status = ProcessingStatus.failed
        query = (
            select(PipelineRun)
            .where(PipelineRun.session_id == session_id)
            .order_by(PipelineRun.id.desc())
            .limit(1)
        )
        run = (await db.execute(query)).scalar_one_or_none()
        if run:
            run.status = PipelineRunStatus.failed
            run.failed_task = failed_task
            run.logs = error_message
            run.ended_at = datetime.now(timezone.utc)
            if run.started_at and run.ended_at:
                run.processing_duration_seconds = int((run.ended_at - run.started_at).total_seconds())
        await db.commit()


def mark_pipeline_failed(session_id: int, failed_task: str, error_message: str) -> None:
    asyncio.run(_mark_pipeline_failed(session_id, failed_task, error_message))


async def _mark_pipeline_done(session_id: int) -> None:
    async with SessionLocal() as db:
        session_obj = await db.get(Session, session_id)
        if session_obj:
            session_obj.processing_status = ProcessingStatus.done
        query = (
            select(PipelineRun)
            .where(PipelineRun.session_id == session_id)
            .order_by(PipelineRun.id.desc())
            .limit(1)
        )
        run = (await db.execute(query)).scalar_one_or_none()
        if run:
            run.status = PipelineRunStatus.done
            run.ended_at = datetime.now(timezone.utc)
            run.logs = "Pipeline completed successfully."
            if run.started_at and run.ended_at:
                run.processing_duration_seconds = int((run.ended_at - run.started_at).total_seconds())
        await db.commit()


def mark_pipeline_done(session_id: int) -> None:
    asyncio.run(_mark_pipeline_done(session_id))


def extract_audio(session_id: int) -> str:
    context = get_session_context(session_id)
    processed_dir = _storage_dir(session_id, "processed")
    processed_dir.mkdir(parents=True, exist_ok=True)
    output_path = processed_dir / "audio.mp3"

    raw_video_path = context["raw_video_path"]
    if not raw_video_path:
        raise ValueError("Missing raw video path.")

    source = Path(raw_video_path)
    if not source.exists():
        raise FileNotFoundError(f"Raw video not found: {source}")

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-acodec",
        "mp3",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True)
    logger.info("Extracted audio for session %s to %s", session_id, output_path)
    return str(output_path)


def transcribe_audio(session_id: int, audio_path: str) -> str:
    processed_dir = _storage_dir(session_id, "processed")
    transcript_path = processed_dir / "transcript.json"
    from backend.services.audio import transcribe_windows
    context = get_session_context(session_id)
    windows_path = _storage_dir(session_id, "raw") / "answer_windows.json"
    windows = load_json(windows_path) if windows_path.exists() else []
    transcription = transcribe_windows(audio_path, windows, context["questions"], context["duration_seconds"])
    transcript_path.write_text(json.dumps(transcription, indent=2), encoding="utf-8")
    logger.info("Saved transcript for session %s to %s", session_id, transcript_path)
    return str(transcript_path)


def split_by_question(session_id: int, transcript_path: str) -> str:
    context = get_session_context(session_id)
    transcript_payload = load_json(transcript_path)
    full_text = str(transcript_payload.get("text", "")).strip()
    questions = context["questions"]
    typed_answers_lookup: dict[int, str] = {}
    raw_answers_path = context.get("raw_answers_path")
    if raw_answers_path:
        try:
            raw_answers = load_json(raw_answers_path)
            if isinstance(raw_answers, list):
                typed_answers_lookup = {
                    int(item.get("question_index", -1)): str(item.get("answer_text", "")).strip()
                    for item in raw_answers
                    if isinstance(item, dict)
                }
        except FileNotFoundError:
            typed_answers_lookup = {}

    if not questions:
        raise ValueError("Job has no configured questions.")

    words = full_text.split()
    chunk_size = max(1, math.ceil(len(words) / len(questions)))
    base_durations = [
        int(question.get("time_limit_seconds") or context["time_limit_per_question"] or 90)
        for question in questions
    ]
    total_base_duration = max(sum(base_durations), 1)
    actual_duration = max(int(context["duration_seconds"] or total_base_duration), 1)
    duration_scale = actual_duration / total_base_duration
    segments: list[dict[str, Any]] = []
    cursor_seconds = 0.0
    for index, question in enumerate(questions):
        start = index * chunk_size
        end = (index + 1) * chunk_size if index < len(questions) - 1 else len(words)
        segment_words = words[start:end]
        transcript_segment = " ".join(segment_words) if segment_words else "No transcript captured."
        exact_transcripts = transcript_payload.get("question_transcripts", {})
        if exact_transcripts:
            transcript_segment = exact_transcripts.get(str(index), "") or "No transcript captured."
        difficulty = question.get("difficulty", "medium")
        response_type = question.get("response_type", "spoken")
        if question.get("response_type") in {"text", "code"}:
            transcript_segment = typed_answers_lookup.get(index, "") or "No answer captured."
        duration_seconds = int(base_durations[index] * duration_scale)
        segment_start_seconds = round(cursor_seconds, 2)
        cursor_seconds += duration_seconds
        segment_end_seconds = round(cursor_seconds, 2)
        windows_path = _storage_dir(session_id, "raw") / "answer_windows.json"
        windows = load_json(windows_path) if windows_path.exists() else []
        window = next((item for item in windows if int(item["question_index"]) == index), None)
        if window:
            segment_start_seconds = float(window["start_seconds"])
            segment_end_seconds = float(window["end_seconds"])
            duration_seconds = max(0, int(segment_end_seconds - segment_start_seconds))
        segments.append(
            {
                "question_index": index,
                "question_text": question["text"],
                "transcript": transcript_segment,
                "duration_seconds": duration_seconds,
                "difficulty_weight": DIFFICULTY_WEIGHTS.get(difficulty, 1.0) * question.get("weight", 1.0),
                "difficulty": difficulty,
                "response_type": response_type,
                "helper_text": question.get("helper_text"),
                "evaluation_focus": question.get("evaluation_focus"),
                "ideal_answer_traits": question.get("ideal_answer_traits", []),
                "red_flag_points": question.get("red_flag_points", []),
                "transcript_start_seconds": segment_start_seconds,
                "transcript_end_seconds": segment_end_seconds,
            }
        )

    output_path = _storage_dir(session_id, "processed") / "question_segments.json"
    output_path.write_text(json.dumps(segments, indent=2), encoding="utf-8")
    logger.info("Split transcript into %s question segments for session %s", len(segments), session_id)
    return str(output_path)


async def _replace_question_responses(session_id: int, payload: list[dict[str, Any]]) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(QuestionResponse).where(QuestionResponse.session_id == session_id))
        db.add_all([QuestionResponse(session_id=session_id, **item) for item in payload])
        await db.commit()


def score_answers(session_id: int, segments_path: str) -> str:
    llm = LLMService()
    segments: list[dict[str, Any]] = load_json(segments_path)
    question_rows: list[dict[str, Any]] = []
    output_payload: list[dict[str, Any]] = []

    for segment in segments:
        result = asyncio.run(
            llm.score_answer(
                segment["question_text"],
                segment["transcript"],
                response_type=str(segment.get("response_type", "spoken")),
                helper_text=segment.get("helper_text"),
                evaluation_focus=segment.get("evaluation_focus"),
                ideal_answer_traits=segment.get("ideal_answer_traits"),
                red_flag_points=segment.get("red_flag_points"),
            )
        )
        answer_quality_score = round(
            (result["relevance"] * 0.4 + result["depth"] * 0.4 + result["communication"] * 0.2),
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
        row = {
            "question_index": segment["question_index"],
            "question_text": segment["question_text"],
            "response_type": segment.get("response_type"),
            "helper_text": segment.get("helper_text"),
            "transcript": segment["transcript"],
            "answer_quality_score": answer_quality_score,
            "relevance_score": float(result["relevance"]),
            "depth_score": float(result["depth"]),
            "confidence_score": confidence_proxy,
            "communication_score": float(result["communication"]),
            "duration_seconds": int(segment["duration_seconds"]),
            "difficulty_weight": float(segment["difficulty_weight"]),
            "ai_summary": result["summary"],
            "transcript_start_seconds": float(segment["transcript_start_seconds"]),
            "transcript_end_seconds": float(segment["transcript_end_seconds"]),
            "score_rationale": score_rationale,
            "highlight_moments": highlight_moments,
            "transcript_timestamps": transcript_timestamps,
        }
        question_rows.append(row)
        output_payload.append(
            {
                **segment,
                **result,
                "answer_quality_score": answer_quality_score,
                "score_rationale": score_rationale,
                "highlight_moments": highlight_moments,
                "transcript_timestamps": transcript_timestamps,
            }
        )

    asyncio.run(_replace_question_responses(session_id, question_rows))
    output_path = _storage_dir(session_id, "processed") / "answer_scores.json"
    output_path.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
    logger.info("Persisted question-level scores for session %s", session_id)
    return str(output_path)


async def _replace_gaze_snapshots(session_id: int, payload: list[dict[str, Any]]) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(GazeSnapshot).where(GazeSnapshot.session_id == session_id))
        db.add_all([GazeSnapshot(session_id=session_id, **item) for item in payload])
        await db.commit()


def analyze_gaze(session_id: int) -> str:
    context = get_session_context(session_id)
    gaze_payload: list[dict[str, Any]] = load_json(context["raw_gaze_path"]) if context["raw_gaze_path"] else []

    formatted_snapshots: list[dict[str, Any]] = []
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

        formatted_snapshots.append(
            {
                "timestamp_seconds": float(item.get("timestamp_seconds", 0)),
                "gaze_x": float(item.get("gaze_x", 0)),
                "gaze_y": float(item.get("gaze_y", 0)),
                "is_on_screen": is_on_screen,
                "confidence": confidence,
            }
        )

    asyncio.run(_replace_gaze_snapshots(session_id, formatted_snapshots))
    sample_count = len(formatted_snapshots) or 1
    summary = {
        "on_screen_ratio": round(on_screen_count / sample_count, 4),
        "deviation_frequency": round(deviation_count / sample_count, 4),
        "longest_off_screen_streak": round(longest_streak * 0.5, 2),
        "longest_off_screen_streak_seconds": round(longest_streak * 0.5, 2),
        "deviation_count": deviation_count,
        "face_missing_count": face_missing_count,
        "face_missing_ratio": round(face_missing_count / sample_count, 4),
    }
    output_path = _storage_dir(session_id, "processed") / "gaze_summary.json"
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logger.info("Generated gaze summary for session %s", session_id)
    return str(output_path)


def score_confidence_task(session_id: int, transcript_path: str, gaze_summary_path: str) -> str:
    transcript_payload = load_json(transcript_path)
    gaze_summary = load_json(gaze_summary_path)
    context = get_session_context(session_id)
    from backend.services.audio import answer_activity
    windows_path = _storage_dir(session_id, "raw") / "answer_windows.json"
    windows = load_json(windows_path) if windows_path.exists() else []
    metrics = answer_activity(_storage_dir(session_id, "processed") / "audio.mp3", windows, context["questions"], context["duration_seconds"])

    total_allowed_duration = max(
        len(context["questions"]) * context["time_limit_per_question"],
        1,
    )
    answer_duration_ratio = (context["duration_seconds"] or total_allowed_duration) / total_allowed_duration
    composite, breakdown = score_confidence(
        transcript=str(transcript_payload.get("text", "")),
        duration_seconds=context["duration_seconds"] or total_allowed_duration,
        gaze_on_screen_ratio=float(gaze_summary["on_screen_ratio"]),
        answer_duration_ratio=answer_duration_ratio,
        audio_metrics=metrics,
    )

    output = {
        "confidence_score": composite,
        "confidence_breakdown": breakdown,
        "audio_metrics": metrics,
        "word_count": count_transcript_words(str(transcript_payload.get("text", ""))),
        "filler_word_count": count_filler_words(str(transcript_payload.get("text", ""))),
        "answer_duration_ratio": round(answer_duration_ratio, 4),
    }
    output_path = _storage_dir(session_id, "processed") / "confidence_metrics.json"
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    logger.info("Generated confidence metrics for session %s", session_id)
    return str(output_path)


async def _replace_integrity_events(session_id: int, payload: list[dict[str, Any]]) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(IntegrityEvent).where(IntegrityEvent.session_id == session_id))
        db.add_all([IntegrityEvent(session_id=session_id, **item) for item in payload])
        await db.commit()


def score_integrity_task(session_id: int, gaze_summary_path: str) -> str:
    context = get_session_context(session_id)
    events: list[dict[str, Any]] = load_json(context["raw_integrity_path"]) if context["raw_integrity_path"] else []
    gaze_summary = load_json(gaze_summary_path)

    db_rows: list[dict[str, Any]] = []
    tab_switches = 0
    copy_paste_events = 0
    screen_inactive_events = 0
    off_screen_events = 0
    for event in events:
        event_type = event.get("event_type", "tab_switch")
        if event_type == IntegrityEventType.tab_switch.value:
            tab_switches += 1
        if event_type == IntegrityEventType.copy_paste.value:
            copy_paste_events += 1
        if event_type == IntegrityEventType.screen_inactive.value:
            screen_inactive_events += 1
        if event_type == IntegrityEventType.off_screen.value:
            off_screen_events += 1
        db_rows.append(
            {
                "event_type": event_type,
                "timestamp_seconds": float(event.get("timestamp_seconds", 0)),
                "duration_seconds": float(event.get("duration_seconds", 0)),
                "severity": event.get("severity", SeverityLevel.medium.value),
                "description": event.get("description", event_type.replace("_", " ").title()),
            }
        )

    asyncio.run(_replace_integrity_events(session_id, db_rows))
    integrity_score_value = score_integrity(
        events=events,
        gaze_deviation_frequency=float(gaze_summary["deviation_frequency"]),
        longest_off_screen_streak_seconds=float(gaze_summary.get("longest_off_screen_streak_seconds", 0.0)),
        face_missing_ratio=float(gaze_summary.get("face_missing_ratio", 0.0)),
    )

    output = {
        "integrity_score": integrity_score_value,
        "flag_count": len(events),
        "tab_switches": tab_switches,
        "copy_paste_events": copy_paste_events,
        "screen_inactive_events": screen_inactive_events,
        "off_screen_events": off_screen_events,
        "gaze_deviation_count": sum(event.get("event_type") == "gaze_deviation" for event in events),
    }
    output_path = _storage_dir(session_id, "processed") / "integrity_summary.json"
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    logger.info("Generated integrity metrics for session %s", session_id)
    return str(output_path)


async def _persist_session_summary(
    session_id: int,
    output: dict[str, Any],
    explainability: dict[str, Any],
    timeline_events: list[dict[str, Any]],
    confidence_breakdown: dict[str, Any],
) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(SessionScore).where(SessionScore.session_id == session_id))
        session_score = SessionScore(
            session_id=session_id,
            overall_score=output["overall_score"],
            answer_quality_score=output["answer_quality"],
            confidence_score=output["confidence"],
            integrity_score=output["integrity"],
            communication_score=output["communication"],
            hire_signal=output["hire_signal"],
            ai_summary=output["summary"],
            scored_at=datetime.now(timezone.utc),
            explainability=explainability,
            score_breakdown=confidence_breakdown,
            timeline_events=timeline_events,
            risk_level=output["risk_level"],
        )
        db.add(session_score)
        await db.commit()


def generate_summary_task(
    session_id: int,
    answer_scores_path: str,
    confidence_path: str,
    integrity_path: str,
) -> str:
    answer_payload: list[dict[str, Any]] = load_json(answer_scores_path)
    confidence_payload = load_json(confidence_path)
    integrity_payload = load_json(integrity_path)

    answer_quality_value = compute_answer_quality(
        [
            {
                "answer_quality_score": item["answer_quality_score"],
                "difficulty_weight": item["difficulty_weight"],
            }
            for item in answer_payload
        ]
    )
    communication_score = round(
        sum(item["communication"] for item in answer_payload) / max(1, len(answer_payload)),
        2,
    )
    confidence_value = float(confidence_payload["confidence_score"])
    integrity_value = float(integrity_payload["integrity_score"])
    overall_score = compute_overall_score(
        answer_quality=answer_quality_value,
        confidence=confidence_value,
        communication=communication_score,
    )
    hire_signal = derive_hire_signal(overall_score, integrity_value)
    risk_level = derive_risk_level(integrity_value, int(integrity_payload["flag_count"]))

    llm = LLMService()
    summaries_list = [item["summary"] for item in answer_payload]
    llm_summary = asyncio.run(
        llm.summarize_session(
            answer_quality=answer_quality_value,
            confidence=confidence_value,
            integrity=integrity_value,
            communication=communication_score,
            flag_count=int(integrity_payload["flag_count"]),
            summaries_list=summaries_list,
        )
    )
    explainability = build_explainability(
        confidence_breakdown=confidence_payload["confidence_breakdown"],
        filler_word_count=int(confidence_payload["filler_word_count"]),
        word_count=int(confidence_payload.get("word_count", 0)),
        tab_switches=int(integrity_payload["tab_switches"]),
        copy_paste_events=int(integrity_payload["copy_paste_events"]),
        gaze_deviation_count=int(integrity_payload["gaze_deviation_count"]),
        screen_inactive_events=int(integrity_payload.get("screen_inactive_events", 0)),
        off_screen_events=int(integrity_payload.get("off_screen_events", 0)),
        content_reasons=build_session_content_reasons(
            answer_quality=answer_quality_value,
            communication=communication_score,
            question_summaries=summaries_list,
        ),
    )
    timeline_events = build_timeline_events(
        integrity_events=load_json(get_session_context(session_id)["raw_integrity_path"]) or [],
        question_summaries=summaries_list,
        question_highlights=[
            highlight
            for item in answer_payload
            for highlight in item.get("highlight_moments", [])
        ],
    )
    output = {
        "overall_score": llm_summary["overall_score"] if "overall_score" in llm_summary else overall_score,
        "answer_quality": answer_quality_value,
        "confidence": confidence_value,
        "integrity": integrity_value,
        "communication": communication_score,
        "hire_signal": llm_summary.get("hire_signal", hire_signal),
        "summary": llm_summary["summary"],
        "risk_level": risk_level,
    }
    asyncio.run(
        _persist_session_summary(
            session_id=session_id,
            output=output,
            explainability=explainability,
            timeline_events=timeline_events,
            confidence_breakdown=confidence_payload["confidence_breakdown"],
        )
    )

    output_path = _storage_dir(session_id, "processed") / "session_summary.json"
    output_path.write_text(
        json.dumps(
            {
                **output,
                "hire_signal": output["hire_signal"].value,
                "risk_level": output["risk_level"].value,
                "explainability": explainability,
                "timeline_events": timeline_events,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("Generated session summary for session %s", session_id)
    return str(output_path)
