from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Appointment, Practitioner, WorkingHours, Specialty, Patient, ScheduleBlock, User
from ..schemas import (
    AppointmentCreate, AppointmentRead, AppointmentUpdate,
    StatusTransition, AvailableSlot, VALID_TRANSITIONS,
)

router = APIRouter(prefix="/appointments", tags=["appointments"])
LOCK_MINUTES = 5


def _get_or_404(appointment_id: str, db: Session) -> Appointment:
    a = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return a


def _strip_tz(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt


def _check_slot_available(db: Session, practitioner_id: str, appt_dt: datetime, exclude_id: Optional[str] = None):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    q = db.query(Appointment).filter(
        Appointment.practitioner_id == practitioner_id,
        Appointment.appointment_date == appt_dt,
        Appointment.status.notin_(["cancelled", "no_show"]),
    )
    if exclude_id:
        q = q.filter(Appointment.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=409, detail="Slot already taken")

    lq = db.query(Appointment).filter(
        Appointment.practitioner_id == practitioner_id,
        Appointment.appointment_date == appt_dt,
        Appointment.locked_until > now,
    )
    if exclude_id:
        lq = lq.filter(Appointment.id != exclude_id)
    if lq.first():
        raise HTTPException(status_code=409, detail="Slot is temporarily locked")


@router.get("/available-slots", response_model=List[AvailableSlot])
def available_slots(
    practitioner_id: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Practitioner).filter(Practitioner.id == practitioner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Practitioner not found")
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


@router.get("", response_model=List[AppointmentRead])
def list_appointments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    practitioner_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Appointment)
    if current_user.role == "patient":
        pat = db.query(Patient).filter(Patient.email == current_user.email).first()
        q = q.filter(Appointment.patient_id == pat.id) if pat else q.filter(False)
    elif current_user.role == "practitioner":
        prac = db.query(Practitioner).filter(Practitioner.user_id == current_user.id).first()
        q = q.filter(Appointment.practitioner_id == prac.id) if prac else q.filter(False)
    else:
        if practitioner_id:
            q = q.filter(Appointment.practitioner_id == practitioner_id)
        if patient_id:
            q = q.filter(Appointment.patient_id == patient_id)

    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d").date()
            q = q.filter(
                Appointment.appointment_date >= datetime.combine(d, datetime.min.time()),
                Appointment.appointment_date < datetime.combine(d, datetime.max.time()),
            )
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format")

    return q.offset(skip).limit(limit).all()


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Patient).filter(Patient.id == payload.patient_id).first():
        raise HTTPException(status_code=404, detail="Patient not found")
    if not db.query(Practitioner).filter(Practitioner.id == payload.practitioner_id).first():
        raise HTTPException(status_code=404, detail="Practitioner not found")
    if not db.query(Specialty).filter(Specialty.id == payload.specialty_id).first():
        raise HTTPException(status_code=404, detail="Specialty not found")

    appt_dt = _strip_tz(payload.appointment_date)
    _check_slot_available(db, payload.practitioner_id, appt_dt)

    lock_until = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=LOCK_MINUTES)
    appt = Appointment(
        patient_id=payload.patient_id,
        practitioner_id=payload.practitioner_id,
        specialty_id=payload.specialty_id,
        appointment_date=appt_dt,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        status="pending",
        locked_until=lock_until,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appt


@router.get("/{appointment_id}", response_model=AppointmentRead)
def get_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_404(appointment_id, db)


@router.put("/{appointment_id}", response_model=AppointmentRead)
def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist")),
):
    appt = _get_or_404(appointment_id, db)

    if payload.appointment_date is not None:
        new_dt = _strip_tz(payload.appointment_date)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if (new_dt - now) < timedelta(hours=24):
            raise HTTPException(status_code=400, detail="Cannot reschedule within 24 hours of appointment")
        _check_slot_available(db, appt.practitioner_id, new_dt, exclude_id=appointment_id)
        appt.appointment_date = new_dt

    if payload.notes is not None:
        appt.notes = payload.notes

    if payload.status is not None:
        allowed = VALID_TRANSITIONS.get(appt.status, set())
        if payload.status not in allowed:
            raise HTTPException(status_code=400, detail=f"Cannot transition from {appt.status} to {payload.status}")
        if payload.status == "cancelled":
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            if (appt.appointment_date - now) < timedelta(hours=24):
                raise HTTPException(status_code=400, detail="Cannot cancel within 24 hours of appointment")
        appt.status = payload.status

    appt.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(appt)
    return appt


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    appt = _get_or_404(appointment_id, db)
    db.delete(appt)
    db.commit()


@router.post("/{appointment_id}/confirm", response_model=AppointmentRead)
def confirm_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    appt = _get_or_404(appointment_id, db)
    appt.locked_until = None
    appt.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(appt)
    return appt
