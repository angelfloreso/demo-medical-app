from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Practitioner, WorkingHours, Specialty, Branch, Appointment, ScheduleBlock, User
from ..schemas import (
    PractitionerCreate, PractitionerRead, PractitionerUpdate,
    WorkingHoursCreate, WorkingHoursRead,
    AvailableSlot,
)

router = APIRouter(prefix="/practitioners", tags=["practitioners"])


def _get_or_404(practitioner_id: str, db: Session) -> Practitioner:
    p = db.query(Practitioner).filter(Practitioner.id == practitioner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Practitioner not found")
    return p


@router.get("", response_model=List[PractitionerRead])
def list_practitioners(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Practitioner).offset(skip).limit(limit).all()


@router.post("", response_model=PractitionerRead, status_code=status.HTTP_201_CREATED)
def create_practitioner(
    payload: PractitionerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    if not db.query(User).filter(User.id == payload.user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    if not db.query(Specialty).filter(Specialty.id == payload.specialty_id).first():
        raise HTTPException(status_code=404, detail="Specialty not found")
    if not db.query(Branch).filter(Branch.id == payload.branch_id).first():
        raise HTTPException(status_code=404, detail="Branch not found")
    practitioner = Practitioner(**payload.model_dump())
    db.add(practitioner)
    db.commit()
    db.refresh(practitioner)
    return practitioner


@router.get("/{practitioner_id}", response_model=PractitionerRead)
def get_practitioner(
    practitioner_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_404(practitioner_id, db)


@router.put("/{practitioner_id}", response_model=PractitionerRead)
def update_practitioner(
    practitioner_id: str,
    payload: PractitionerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    p = _get_or_404(practitioner_id, db)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{practitioner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_practitioner(
    practitioner_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    p = _get_or_404(practitioner_id, db)
    db.delete(p)
    db.commit()


# ── Working Hours ─────────────────────────────────────────────────────────────

@router.get("/{practitioner_id}/working-hours", response_model=List[WorkingHoursRead])
def get_working_hours(
    practitioner_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_or_404(practitioner_id, db)
    return db.query(WorkingHours).filter(WorkingHours.practitioner_id == practitioner_id).all()


@router.post("/{practitioner_id}/working-hours", response_model=WorkingHoursRead, status_code=status.HTTP_201_CREATED)
def create_working_hours(
    practitioner_id: str,
    payload: WorkingHoursCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    _get_or_404(practitioner_id, db)
    wh = WorkingHours(practitioner_id=practitioner_id, **payload.model_dump())
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/{practitioner_id}/working-hours/{wh_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_working_hours(
    practitioner_id: str,
    wh_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    _get_or_404(practitioner_id, db)
    wh = db.query(WorkingHours).filter(
        WorkingHours.id == wh_id, WorkingHours.practitioner_id == practitioner_id
    ).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Working hours entry not found")
    db.delete(wh)
    db.commit()


# ── Availability ──────────────────────────────────────────────────────────────

@router.get("/{practitioner_id}/availability", response_model=List[AvailableSlot])
def get_availability(
    practitioner_id: str,
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_or_404(practitioner_id, db)
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format, use YYYY-MM-DD")

    day_of_week = target_date.weekday()
    wh_entries = db.query(WorkingHours).filter(
        WorkingHours.practitioner_id == practitioner_id,
        WorkingHours.day_of_week == day_of_week,
        WorkingHours.is_active == True,
    ).all()

    if not wh_entries:
        return []

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    slots: List[AvailableSlot] = []

    for wh in wh_entries:
        current = datetime.combine(target_date, wh.start_time)
        end = datetime.combine(target_date, wh.end_time)

        while current + timedelta(minutes=30) <= end:
            conflict = db.query(Appointment).filter(
                Appointment.practitioner_id == practitioner_id,
                Appointment.appointment_date == current,
                Appointment.status.notin_(["cancelled", "no_show"]),
            ).first()

            locked = db.query(Appointment).filter(
                Appointment.practitioner_id == practitioner_id,
                Appointment.appointment_date == current,
                Appointment.locked_until > now,
            ).first()

            blocked = db.query(ScheduleBlock).filter(
                ScheduleBlock.practitioner_id == practitioner_id,
                ScheduleBlock.start_datetime <= current,
                ScheduleBlock.end_datetime > current,
            ).first()

            if not conflict and not locked and not blocked:
                slots.append(AvailableSlot(datetime=current, duration_minutes=30))

            current += timedelta(minutes=30)

    return slots
