from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from backend.core.config import get_settings


settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    # Pipeline tasks use separate asyncio.run loops; pooled asyncpg connections
    # must never be reused across those loops.
    poolclass=NullPool,
    future=True,
)
SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
