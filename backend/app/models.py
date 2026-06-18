import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Date, Text, Integer, Time, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    full_name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    biological_sex = Column(String(10), nullable=False)
    phone = Column(String(30), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    allergies = Column(Text, nullable=True)
    government_id = Column(String(100), unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Specialty(Base):
    __tablename__ = "specialties"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(500), nullable=True)

    practitioners = relationship("Practitioner", back_populates="specialty")


class Branch(Base):
    __tablename__ = "branches"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String(150), nullable=False)
    address = Column(String(300), nullable=True)
    phone = Column(String(30), nullable=True)

    practitioners = relationship("Practitioner", back_populates="branch")


class Practitioner(Base):
    __tablename__ = "practitioners"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    specialty_id = Column(String(36), ForeignKey("specialties.id"), nullable=False)
    branch_id = Column(String(36), ForeignKey("branches.id"), nullable=False)
    license_number = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")
    specialty = relationship("Specialty", back_populates="practitioners")
    branch = relationship("Branch", back_populates="practitioners")
    working_hours = relationship("WorkingHours", back_populates="practitioner", cascade="all, delete-orphan")
    schedule_blocks = relationship("ScheduleBlock", back_populates="practitioner", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="practitioner")


class WorkingHours(Base):
    __tablename__ = "working_hours"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    practitioner_id = Column(String(36), ForeignKey("practitioners.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    practitioner = relationship("Practitioner", back_populates="working_hours")


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    practitioner_id = Column(String(36), ForeignKey("practitioners.id"), nullable=False)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    reason = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    practitioner = relationship("Practitioner", back_populates="schedule_blocks")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False)
    practitioner_id = Column(String(36), ForeignKey("practitioners.id"), nullable=False)
    specialty_id = Column(String(36), ForeignKey("specialties.id"), nullable=False)
    appointment_date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=30, nullable=False)
    status = Column(String(30), default="pending", nullable=False)
    notes = Column(Text, nullable=True)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    patient = relationship("Patient")
    practitioner = relationship("Practitioner", back_populates="appointments")
    specialty = relationship("Specialty")
