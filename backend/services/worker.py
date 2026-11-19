"""Small default worker; Airflow remains an optional alternative consumer."""

import logging
import time
import threading

from redis import Redis

from backend.core.config import get_settings
from sqlalchemy import create_engine, text
from backend.services import pipeline


def process_session(session_id: int) -> None:
    task = "start_run"
    try:
        pipeline.start_pipeline_run(session_id)
        task = "extract_audio"
        audio = pipeline.extract_audio(session_id)
        task = "transcribe_audio"
        transcript = pipeline.transcribe_audio(session_id, audio)
        task = "split_by_question"
        segments = pipeline.split_by_question(session_id, transcript)
        task = "score_answers"
        answers = pipeline.score_answers(session_id, segments)
        task = "analyze_gaze"
        gaze = pipeline.analyze_gaze(session_id)
        task = "score_confidence"
        confidence = pipeline.score_confidence_task(session_id, transcript, gaze)
        task = "score_integrity"
        integrity = pipeline.score_integrity_task(session_id, gaze)
        task = "generate_summary"
        pipeline.generate_summary_task(session_id, answers, confidence, integrity)
        pipeline.mark_pipeline_done(session_id)
    except Exception as exc:
        logging.exception("Session %s failed at %s", session_id, task)
        pipeline.mark_pipeline_failed(session_id, task, str(exc))


def consume(redis: Redis, db, settings, owner) -> None:
    def send_heartbeat():
        while True:
            try:
                redis.set("interview_worker_heartbeat", str(time.time()), ex=45)
            except Exception:
                logging.warning("Worker heartbeat could not reach Redis")
            time.sleep(10)
    threading.Thread(target=send_heartbeat, daemon=True).start()
    while True:
        # A database restart drops advisory locks. Exit instead of continuing
        # with a second consumer after our ownership connection disappears.
        owner.scalar(text("SELECT 1"))
        try:
            item = redis.blpop(settings.redis_queue_name, timeout=5)
            with db.begin() as connection:
                # Recover saved uploads even if enqueue failed. The conditional
                # claim also prevents replaying an already processed queue item.
                session_id = int(item[1]) if item else connection.scalar(text(
                    "SELECT id FROM sessions WHERE processing_status='pending' ORDER BY id LIMIT 1"
                ))
                claimed = connection.scalar(text(
                    "UPDATE sessions SET processing_status='processing' "
                    "WHERE id=:id AND processing_status='pending' RETURNING id"
                ), {"id": session_id}) if session_id else None
            if claimed:
                process_session(claimed)
        except Exception:
            logging.exception("Worker could not consume the queue; retrying")
            time.sleep(3)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    db = create_engine(settings.sync_database_url, pool_pre_ping=True)
    # The default consumer is deliberately single-worker. Keep a PostgreSQL
    # session lock so restart recovery cannot fail another live worker's job.
    with db.connect().execution_options(isolation_level="AUTOCOMMIT") as owner:
        if not owner.scalar(text("SELECT pg_try_advisory_lock(7241, 1)")):
            raise RuntimeError("A default interview worker is already running for this database.")
        interrupted = owner.execute(text("SELECT id FROM sessions WHERE processing_status='processing'")).scalars().all()
        for session_id in interrupted:
            pipeline.mark_pipeline_failed(session_id, "worker_interrupted",
                "Processing stopped when the worker restarted. The recording is saved; retry analysis from HR review.")
        try:
            consume(redis, db, settings, owner)
        finally:
            owner.execute(text("SELECT pg_advisory_unlock(7241, 1)"))


if __name__ == "__main__":
    main()
