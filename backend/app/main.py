from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, layers

app = FastAPI(title="Mosad API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(layers.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
