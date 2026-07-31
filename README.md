# Mosad

Management system for non-formal education frameworks (מוסדות, שכבות, מדריכים, חניכים).

## Stack

- Backend: FastAPI (Python) + SQLAlchemy 2.0 + Alembic
- Frontend: React + TypeScript (Vite)
- Database: PostgreSQL (local via Docker Compose)

## Status

Phase 1 in progress: project scaffold, multi-tenant auth, layers + participant roster.

## Local dev setup

```bash
docker compose up -d db
```

Backend and frontend setup instructions will be added as those pieces are built.
