# Sets up the connection to Postgres and the tools every model/router
# needs to talk to the database.
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# `engine` represents the actual connection pool to the database.
# It doesn't connect immediately — connections are opened lazily as needed.
engine = create_engine(settings.database_url)

# A "session" is a single unit-of-work / transaction with the DB.
# SessionLocal is a factory: calling SessionLocal() gives you a new session.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    # Every model (table) in models/ inherits from this class.
    # SQLAlchemy uses Base.metadata to know about every table that exists,
    # which is exactly what Alembic reads to auto-generate migrations.
    pass


def get_db():
    """FastAPI dependency: opens one DB session per incoming request,
    hands it to the route function, and always closes it afterwards
    (even if the route raised an error) so connections don't leak."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
