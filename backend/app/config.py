# Reads configuration from the .env file (and environment variables)
# so secrets/URLs never get hardcoded in the source code.
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


# Created once, at import time. Every other file imports this same
# `settings` object instead of reading os.environ directly.
settings = Settings()
