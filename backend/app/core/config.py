"""Application configuration loaded from environment variables (see .env.example)."""
from functools import lru_cache

from pydantic import field_validator
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
    ai_provider: str = "auto"  # auto | anthropic | openai | gemini (auto = first provider with a key)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"

    # Google OAuth / Calendar
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""  # default: {frontend_url}/api/v1/integrations/google/callback

    # CalDAV (iCloud and others). Private/loopback hosts are refused unless explicitly allowed (SSRF guard)
    caldav_allow_private_hosts: bool = False
    calendar_sync_minutes: int = 15

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # Hosting providers (Render, Heroku...) hand out postgres:// or postgresql:// URLs.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def google_redirect(self) -> str:
        return self.google_redirect_uri or f"{self.frontend_url.rstrip('/')}/api/v1/integrations/google/callback"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
