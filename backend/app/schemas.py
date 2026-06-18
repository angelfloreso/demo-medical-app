from datetime import date, datetime, time
from typing import Optional, List
from pydantic import BaseModel, EmailStr


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    password: str
    role: str = "patient"


class UserRead(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


# ── Patient ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: date
    biological_sex: str
    phone: Optional[str] = None
    email: EmailStr
    allergies: Optional[str] = None
    government_id: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    biological_sex: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    allergies: Optional[str] = None
    government_id: Optional[str] = None


class PatientRead(BaseModel):
    id: str
    full_name: str
    date_of_birth: date
    biological_sex: str
    phone: Optional[str] = None
    email: str
    allergies: Optional[str] = None
    government_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Specialty / Branch ────────────────────────────────────────────────────────

class SpecialtyCreate(BaseModel):
    name: str
    description: Optional[str] = None


class SpecialtyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SpecialtyRead(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class BranchCreate(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class BranchRead(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}


# ── WorkingHours ──────────────────────────────────────────────────────────────

class WorkingHoursCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool = True


class WorkingHoursRead(BaseModel):
    id: str
    practitioner_id: str
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool

    model_config = {"from_attributes": True}


# ── Practitioner ──────────────────────────────────────────────────────────────

class PractitionerCreate(BaseModel):
    user_id: str
    full_name: str
    specialty_id: str
    branch_id: str
    license_number: Optional[str] = None


class PractitionerUpdate(BaseModel):
    full_name: Optional[str] = None
    specialty_id: Optional[str] = None
    branch_id: Optional[str] = None
    license_number: Optional[str] = None


class PractitionerRead(BaseModel):
    id: str
    user_id: str
    full_name: str
    specialty_id: str
    branch_id: str
    license_number: Optional[str] = None
    created_at: datetime
    specialty: SpecialtyRead
    branch: BranchRead
    working_hours: List[WorkingHoursRead] = []

    model_config = {"from_attributes": True}


# ── ScheduleBlock ─────────────────────────────────────────────────────────────

class ScheduleBlockCreate(BaseModel):
    practitioner_id: str
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None


class ScheduleBlockRead(BaseModel):
    id: str
    practitioner_id: str
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Appointment ───────────────────────────────────────────────────────────────

VALID_TRANSITIONS = {
    "pending": {"in_waiting_room", "cancelled"},
    "in_waiting_room": {"in_consultation", "cancelled", "no_show"},
    "in_consultation": {"completed", "no_show"},
    "completed": set(),
    "cancelled": set(),
    "no_show": set(),
}


class AppointmentCreate(BaseModel):
    patient_id: str
    practitioner_id: str
    specialty_id: str
    appointment_date: datetime
    duration_minutes: int = 30
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    appointment_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class StatusTransition(BaseModel):
    status: str


class AppointmentRead(BaseModel):
    id: str
    patient_id: str
    practitioner_id: str
    specialty_id: str
    appointment_date: datetime
    duration_minutes: int
    status: str
    notes: Optional[str] = None
    locked_until: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    patient: PatientRead
    practitioner: PractitionerRead
    specialty: SpecialtyRead

    model_config = {"from_attributes": True}


# ── Available slot ────────────────────────────────────────────────────────────

class AvailableSlot(BaseModel):
    datetime: datetime
    duration_minutes: int = 30
