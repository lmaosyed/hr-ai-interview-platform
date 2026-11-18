from redis.asyncio import Redis

from backend.core.config import get_settings


settings = get_settings()


def build_redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def enqueue_session(session_id: int) -> None:
    redis = build_redis_client()
    try:
        await redis.rpush(settings.redis_queue_name, str(session_id))
    finally:
        await redis.aclose()
