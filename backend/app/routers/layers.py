# More endpoints will be added here in phase 4 (list layers, assign/
# unassign counselors, list participants). For now: create + join.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.layer import LayerCreate, LayerJoin, LayerOut
from app.services.group_service import create_layer, join_layer

router = APIRouter(prefix="/layers", tags=["layers"])


@router.post("", response_model=LayerOut, status_code=201)
def create_layer_endpoint(
    payload: LayerCreate,
    current_user: User = Depends(get_current_user),   # must be logged in
    db: Session = Depends(get_db),
):
    return create_layer(db, current_user, payload)


@router.post("/join", response_model=LayerOut)
def join_layer_endpoint(
    payload: LayerJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return join_layer(db, current_user, payload.join_code)
