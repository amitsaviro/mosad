# Reads configuration from the .env file (and environment variables)
# so secrets/URLs never get hardcoded in the source code.
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Tells pydantic-settings to load values from a file named ".env"
    # in the current working directory. "extra=ignore" means unknown
    # keys in .env won't cause an error.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Each attribute below is read from an env var with the same name
    # (case-insensitive), e.g. database_url <- DATABASE_URL.
    database_url: str          # connection string for Postgres
    jwt_secret: str            # secret key used to sign/verify login tokens
    jwt_algorithm: str = "HS256"     # default if not set in .env
    jwt_expire_minutes: int = 1440   # default if not set in .env (24 hours)
    # Optional: powers the AI scheduling agent's real reasoning step.
    # Without it, that agent falls back to a plain ratings-based
    # heuristic instead of failing outright.
    anthropic_api_key: str | None = None
    # Comma-separated list of origins allowed to call the API from a
    # browser (CORS). Only matters for the web build -- native app
    # requests aren't subject to CORS at all.
    cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        # Managed Postgres providers (Render, Heroku, etc.) hand out
        # "postgres://" or "postgresql://" connection strings, but this
        # app's driver is psycopg3 -- SQLAlchemy needs the scheme
        # spelled out as "postgresql+psycopg://" to pick it correctly.
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# Created once, at import time. Every other file imports this same
# `settings` object instead of reading os.environ directly.
settings = Settings()
