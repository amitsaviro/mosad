# Shared pytest fixtures for every test file. pytest automatically finds
# and applies this file to all tests in this directory (no import needed).
#
# Strategy: run tests against a REAL Postgres database (a separate one,
# "mosad_test", so it never touches your dev data), because our models
# use Postgres-specific UUID columns that don't work with SQLite.
# Tables are created once per test session; every table is wiped clean
# after each individual test so tests never see leftover data from
# another test.
from urllib.parse import urlsplit, urlunsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app


def _with_db_name(url: str, db_name: str) -> str:
    """Swaps the database name in a connection URL, keeping everything
    else (host, port, user, password) the same."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{db_name}", parts.query, parts.fragment))


TEST_DATABASE_URL = _with_db_name(settings.database_url, "mosad_test")


def _ensure_test_database_exists() -> None:
    # Connect to the default "postgres" maintenance database (which
    # always exists) just to check/create "mosad_test" alongside it.
    admin_url = _with_db_name(settings.database_url, "postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": "mosad_test"}
        ).first()
        if not exists:
            conn.execute(text("CREATE DATABASE mosad_test"))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def test_engine():
    """Runs once for the whole test run: makes sure mosad_test exists
    and has all our tables, then drops everything at the very end."""
    _ensure_test_database_exists()
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(test_engine):
    """Runs after EVERY test automatically (autouse=True): deletes all
    rows from every table so the next test starts from a blank slate.
    Order matters — child tables (with foreign keys) must be cleared
    before their parent tables."""
    yield
    with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def client(test_engine):
    """What test functions actually use: a fake HTTP client wired up to
    our FastAPI app, but with the DB dependency swapped to point at
    mosad_test instead of the real dev database."""
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
