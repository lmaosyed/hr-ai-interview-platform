from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.exceptions import AirflowException
from airflow.operators.python import PythonOperator
from airflow.sensors.python import PythonSensor
from redis import Redis

from backend.core.config import get_settings
from backend.services.pipeline import (
    analyze_gaze,
    extract_audio,
    generate_summary_task,
    mark_pipeline_done,
    mark_pipeline_failed,
    score_answers,
    score_confidence_task,
    score_integrity_task,
    split_by_question,
    start_pipeline_run,
    transcribe_audio,
)


settings = get_settings()


def _poll_queue(**context) -> bool:
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    session_id = redis.lpop(settings.redis_queue_name)
    redis.close()
    if not session_id:
        return False
    context["ti"].xcom_push(key="session_id", value=int(session_id))
    return True


def _with_failure_tracking(task_name: str, fn, **context):
    ti = context["ti"]
    session_id = ti.xcom_pull(task_ids="poll_queue", key="session_id")
    if session_id is None:
        raise AirflowException("No session_id found in XCom.")

    try:
        return fn(session_id=session_id, ti=ti)
    except Exception as exc:  # pragma: no cover - Airflow runtime branch
        mark_pipeline_failed(int(session_id), task_name, str(exc))
        raise


def _start_run(session_id: int, ti) -> int:
    run_id = start_pipeline_run(session_id)
    ti.xcom_push(key="pipeline_run_id", value=run_id)
    return run_id


def _extract_audio(session_id: int, ti) -> str:
    audio_path = extract_audio(session_id)
    ti.xcom_push(key="audio_path", value=audio_path)
    return audio_path


def _transcribe_audio(session_id: int, ti) -> str:
    audio_path = ti.xcom_pull(task_ids="extract_audio", key="audio_path")
    transcript_path = transcribe_audio(session_id, audio_path)
    ti.xcom_push(key="transcript_path", value=transcript_path)
    return transcript_path


def _split_by_question(session_id: int, ti) -> str:
    transcript_path = ti.xcom_pull(task_ids="transcribe_audio", key="transcript_path")
    segments_path = split_by_question(session_id, transcript_path)
    ti.xcom_push(key="segments_path", value=segments_path)
    return segments_path


def _score_answers(session_id: int, ti) -> str:
    segments_path = ti.xcom_pull(task_ids="split_by_question", key="segments_path")
    answer_scores_path = score_answers(session_id, segments_path)
    ti.xcom_push(key="answer_scores_path", value=answer_scores_path)
    return answer_scores_path


def _analyze_gaze(session_id: int, ti) -> str:
    gaze_path = analyze_gaze(session_id)
    ti.xcom_push(key="gaze_summary_path", value=gaze_path)
    return gaze_path


def _score_confidence(session_id: int, ti) -> str:
    transcript_path = ti.xcom_pull(task_ids="transcribe_audio", key="transcript_path")
    gaze_summary_path = ti.xcom_pull(task_ids="analyze_gaze", key="gaze_summary_path")
    output_path = score_confidence_task(session_id, transcript_path, gaze_summary_path)
    ti.xcom_push(key="confidence_path", value=output_path)
    return output_path


def _score_integrity(session_id: int, ti) -> str:
    gaze_summary_path = ti.xcom_pull(task_ids="analyze_gaze", key="gaze_summary_path")
    output_path = score_integrity_task(session_id, gaze_summary_path)
    ti.xcom_push(key="integrity_path", value=output_path)
    return output_path


def _generate_summary(session_id: int, ti) -> str:
    answer_scores_path = ti.xcom_pull(task_ids="score_answers", key="answer_scores_path")
    confidence_path = ti.xcom_pull(task_ids="score_confidence", key="confidence_path")
    integrity_path = ti.xcom_pull(task_ids="score_integrity", key="integrity_path")
    summary_path = generate_summary_task(session_id, answer_scores_path, confidence_path, integrity_path)
    ti.xcom_push(key="summary_path", value=summary_path)
    return summary_path


def _update_status(session_id: int, ti) -> str:
    mark_pipeline_done(session_id)
    return "done"


with DAG(
    dag_id="process_interview_session",
    description="Process uploaded async interview sessions into HR-facing analytics.",
    start_date=datetime(2025, 1, 1),
    schedule="*/1 * * * *",
    catchup=False,
    default_args={
        "owner": "codex",
        "retries": 1,
        "retry_delay": timedelta(minutes=1),
    },
) as dag:
    poll_queue = PythonSensor(
        task_id="poll_queue",
        python_callable=_poll_queue,
        mode="reschedule",
        poke_interval=30,
        timeout=60 * 60,
    )

    start_run = PythonOperator(
        task_id="start_run",
        python_callable=lambda **context: _with_failure_tracking("start_run", _start_run, **context),
    )
    extract_audio_task = PythonOperator(
        task_id="extract_audio",
        python_callable=lambda **context: _with_failure_tracking("extract_audio", _extract_audio, **context),
    )
    transcribe_audio_task = PythonOperator(
        task_id="transcribe_audio",
        python_callable=lambda **context: _with_failure_tracking("transcribe_audio", _transcribe_audio, **context),
    )
    split_by_question_task = PythonOperator(
        task_id="split_by_question",
        python_callable=lambda **context: _with_failure_tracking("split_by_question", _split_by_question, **context),
    )
    score_answers_task = PythonOperator(
        task_id="score_answers",
        python_callable=lambda **context: _with_failure_tracking("score_answers", _score_answers, **context),
    )
    analyze_gaze_task = PythonOperator(
        task_id="analyze_gaze",
        python_callable=lambda **context: _with_failure_tracking("analyze_gaze", _analyze_gaze, **context),
    )
    score_confidence_operator = PythonOperator(
        task_id="score_confidence",
        python_callable=lambda **context: _with_failure_tracking("score_confidence", _score_confidence, **context),
    )
    score_integrity_operator = PythonOperator(
        task_id="score_integrity",
        python_callable=lambda **context: _with_failure_tracking("score_integrity", _score_integrity, **context),
    )
    generate_summary_operator = PythonOperator(
        task_id="generate_summary",
        python_callable=lambda **context: _with_failure_tracking("generate_summary", _generate_summary, **context),
    )
    update_status = PythonOperator(
        task_id="update_status",
        python_callable=lambda **context: _with_failure_tracking("update_status", _update_status, **context),
    )

    poll_queue >> start_run >> extract_audio_task >> transcribe_audio_task >> split_by_question_task
    split_by_question_task >> score_answers_task
    score_answers_task >> analyze_gaze_task
    analyze_gaze_task >> [score_confidence_operator, score_integrity_operator]
    [score_confidence_operator, score_integrity_operator] >> generate_summary_operator >> update_status
