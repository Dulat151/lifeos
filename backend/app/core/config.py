"""Application configuration loaded from environment variables (see .env.example)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LIFE OS"
    environment: str = "development"  # development | test | production
    debug: bool = False

    database_url: str = "postgresql+psycopg://lifeos:lifeos@localhost:5432/lifeos"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "change-me-in-production-please-32+chars"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    cookie_secure: bool = False
    cookie_domain: str | None = None

    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    # Rate limiting (requests per window per key)
    rate_limit_auth: int = 20
    rate_limit_ai: int = 20
    rate_limit_window_seconds: int = 60

    # Files
    upload_dir: str = "./storage/uploads"
    max_upload_mb: int = 15

    # Email (SMTP). If smtp_host is empty, emails are NOT sent; delivery is recorded as failed
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "LIFE OS <no-reply@lifeos.local>"
    smtp_tls: bool = True

    # Web Push (VAPID). Without keys, push channel reports "not configured"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@lifeos.local"

    # AI (server side only)
    ai_provider: str = "anthropic"  # anthropic | openai
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Google OAuth / Calendar
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/integrations/google/callback"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
