from functools import lru_cache
from pathlib import Path
import secrets

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


ROOT_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = ROOT_DIR / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "HR AI Interview Platform"
    app_env: str = "development"
    api_prefix: str = "/api"
    frontend_origin: str = "http://localhost:5173"

    postgres_user: str = "hr_user"
    postgres_password: str = "hr_password"
    postgres_db: str = "hr_platform"
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    redis_url: str = "redis://redis:6379/0"
    redis_queue_name: str = "interview_sessions"

    storage_root: Path = STORAGE_DIR
    raw_storage_subdir: str = "raw"
    processed_storage_subdir: str = "processed"

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-20250514"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    llm_provider: str = Field(
        default="auto",
        description="auto, anthropic, or gemini",
    )
    openai_api_key: str | None = None
    whisper_model: str = "whisper-1"
    transcription_provider: str = Field(
        default="gemini",
        description="demo, openai, gemini, auto, or faster_whisper",
    )
    demo_mode: bool = False
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = "admin"
    session_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    company_name: str = "Interview Review Studio"
    smtp_host: str | None = None
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = False
    smtp_from_email: str = "noreply@interviewreviewstudio.local"
    smtp_from_name: str = "Interview Review Studio"
    mailbox_preview_url: str | None = "http://localhost:58025"

    airflow__core__executor: str = "CeleryExecutor"
    airflow_uid: int = 50000

    @field_validator("session_secret", mode="before")
    @classmethod
    def nonempty_session_secret(cls, value: str | None) -> str:
        return value.strip() if value and value.strip() else secrets.token_urlsafe(48)

    @property
    def database_url(self) -> str:
        return URL.create("postgresql+asyncpg", username=self.postgres_user,
                          password=self.postgres_password, host=self.postgres_host,
                          port=self.postgres_port, database=self.postgres_db).render_as_string(hide_password=False)

    @property
    def sync_database_url(self) -> str:
        return URL.create("postgresql", username=self.postgres_user,
                          password=self.postgres_password, host=self.postgres_host,
                          port=self.postgres_port, database=self.postgres_db).render_as_string(hide_password=False)

    @property
    def raw_storage_dir(self) -> Path:
        return self.storage_root / self.raw_storage_subdir

    @property
    def processed_storage_dir(self) -> Path:
        return self.storage_root / self.processed_storage_subdir


@lru_cache
def get_settings() -> Settings:
    return Settings()
