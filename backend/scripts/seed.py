"""Bootstrap the administrator without adding sample applicants or fabricated scores."""

import asyncio

from sqlalchemy import select

from backend.core.config import get_settings
from backend.core.database import SessionLocal, engine
from backend.core.security import hash_password
from backend.models import AdminUser, Base


async def main() -> None:
    settings = get_settings()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        if await session.scalar(select(AdminUser.id).limit(1)) is None:
            session.add(AdminUser(
                name="Platform Admin", email="admin@example.com",
                username=settings.bootstrap_admin_username,
                password=hash_password(settings.bootstrap_admin_password), is_active=True,
            ))
            await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
