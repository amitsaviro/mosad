# The entry point: this is what `uvicorn app.main:app` actually runs.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    activities,
    auth,
    calendar_activities,
    holidays,
    institutions,
    key_dates,
    layers,
    notes,
    participants,
    trips,
    users,
)

app = FastAPI(title="Mosad API")

# Browsers block JS from calling a different origin (port) than the page
# was loaded from, unless the server explicitly allows it (CORS).
# Expo's web dev server runs on :8081, this API on :8000 — different
# origins — so without this, the frontend couldn't call the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081", "http://localhost:19006"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every route inside auth.router/layers.router gets "/api/v1" stuck in
# front of its own prefix, e.g. "/auth/login" -> "/api/v1/auth/login".
app.include_router(auth.router, prefix="/api/v1")
app.include_router(activities.router, prefix="/api/v1")
app.include_router(calendar_activities.router, prefix="/api/v1")
app.include_router(holidays.router, prefix="/api/v1")
app.include_router(institutions.router, prefix="/api/v1")
app.include_router(key_dates.router, prefix="/api/v1")
app.include_router(layers.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(participants.router, prefix="/api/v1")
app.include_router(trips.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")


@app.get("/health")
def health():
    # Simple endpoint to check "is the server even running" —
    # no auth, no DB access, just confirms the process is alive.
    return {"status": "ok"}
