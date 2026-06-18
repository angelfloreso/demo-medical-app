from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Appointment, User
from ..schemas import AppointmentRead, StatusTransition, VALID_TRANSITIONS

router = APIRouter(prefix="/waiting-room", tags=["waiting-room"])


@router.get("", response_model=List[AppointmentRead])
def get_waiting_room(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist", "practitioner")),
):
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    from datetime import timedelta
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    return db.query(Appointment).filter(
        Appointment.appointment_date >= today_start,
        Appointment.appointment_date < today_end,
        Appointment.status.notin_(["cancelled", "no_show"]),
    ).order_by(Appointment.appointment_date).all()


@router.put("/{appointment_id}/status", response_model=AppointmentRead)
def transition_status(
    appointment_id: str,
    payload: StatusTransition,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist", "practitioner")),
):
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    allowed = VALID_TRANSITIONS.get(appt.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{appt.status}' to '{payload.status}'. Allowed: {list(allowed)}",
        )

    appt.status = payload.status
    appt.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(appt)
    return appt
