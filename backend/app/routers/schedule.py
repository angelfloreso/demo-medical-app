from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import ScheduleBlock, Practitioner, User
from ..schemas import ScheduleBlockCreate, ScheduleBlockRead

router = APIRouter(prefix="/schedule-blocks", tags=["schedule-blocks"])


@router.get("", response_model=List[ScheduleBlockRead])
def list_blocks(
    practitioner_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist", "practitioner")),
):
    q = db.query(ScheduleBlock)
    if practitioner_id:
        q = q.filter(ScheduleBlock.practitioner_id == practitioner_id)
    elif current_user.role == "practitioner":
        prac = db.query(Practitioner).filter(Practitioner.user_id == current_user.id).first()
        if prac:
            q = q.filter(ScheduleBlock.practitioner_id == prac.id)
    return q.order_by(ScheduleBlock.start_datetime).all()


@router.post("", response_model=ScheduleBlockRead, status_code=status.HTTP_201_CREATED)
def create_block(
    payload: ScheduleBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "practitioner")),
):
    if not db.query(Practitioner).filter(Practitioner.id == payload.practitioner_id).first():
        raise HTTPException(status_code=404, detail="Practitioner not found")
    if payload.end_datetime <= payload.start_datetime:
        raise HTTPException(status_code=400, detail="end_datetime must be after start_datetime")
    block = ScheduleBlock(**payload.model_dump(), created_by=current_user.id)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(
    block_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "practitioner")),
):
    block = db.query(ScheduleBlock).filter(ScheduleBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    db.delete(block)
    db.commit()
