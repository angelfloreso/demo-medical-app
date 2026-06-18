from datetime import date, time, datetime, timezone, timedelta
from sqlalchemy.orm import Session

from .models import User, Patient, Specialty, Branch, Practitioner, WorkingHours, Appointment
from .auth import get_password_hash


def seed_database(db: Session) -> None:
    if db.query(User).first():
        return  # already seeded

    # Specialties
    general = Specialty(name="General Medicine", description="Primary care and general health")
    cardiology = Specialty(name="Cardiology", description="Heart and cardiovascular care")
    pediatrics = Specialty(name="Pediatrics", description="Medical care for children")
    db.add_all([general, cardiology, pediatrics])
    db.flush()

    # Branch
    branch = Branch(name="Main Clinic", address="123 Medical Drive, Health City", phone="+1-555-0100")
    db.add(branch)
    db.flush()

    # Admin user
    admin = User(
        email="admin@medsched.com",
        full_name="System Administrator",
        hashed_password=get_password_hash("admin123"),
        role="admin",
        is_active=True,
    )

    # Receptionist user
    receptionist = User(
        email="receptionist@medsched.com",
        full_name="Front Desk",
        hashed_password=get_password_hash("admin123"),
        role="receptionist",
        is_active=True,
    )

    # Practitioner users
    prac_user1 = User(
        email="dr.smith@medsched.com",
        full_name="Dr. John Smith",
        hashed_password=get_password_hash("admin123"),
        role="practitioner",
        is_active=True,
    )
    prac_user2 = User(
        email="dr.jones@medsched.com",
        full_name="Dr. Sarah Jones",
        hashed_password=get_password_hash("admin123"),
        role="practitioner",
        is_active=True,
    )

    db.add_all([admin, receptionist, prac_user1, prac_user2])
    db.flush()

    # Practitioners
    p1 = Practitioner(
        user_id=prac_user1.id,
        full_name="Dr. John Smith",
        specialty_id=general.id,
        branch_id=branch.id,
        license_number="LIC-001",
    )
    p2 = Practitioner(
        user_id=prac_user2.id,
        full_name="Dr. Sarah Jones",
        specialty_id=cardiology.id,
        branch_id=branch.id,
        license_number="LIC-002",
    )
    db.add_all([p1, p2])
    db.flush()

    # Working hours Mon-Fri 08:00-17:00 for both practitioners
    for prac in [p1, p2]:
        for day in range(5):  # 0=Mon to 4=Fri
            db.add(WorkingHours(
                practitioner_id=prac.id,
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(17, 0),
                is_active=True,
            ))

    # Sample patients
    patients_data = [
        dict(full_name="Alice Johnson", date_of_birth=date(1985, 3, 15), biological_sex="female",
             phone="+1-555-0201", email="alice@example.com", government_id="GOV-001"),
        dict(full_name="Bob Williams", date_of_birth=date(1972, 7, 22), biological_sex="male",
             phone="+1-555-0202", email="bob@example.com", government_id="GOV-002"),
        dict(full_name="Carol Davis", date_of_birth=date(1990, 11, 5), biological_sex="female",
             phone="+1-555-0203", email="carol@example.com", government_id="GOV-003"),
        dict(full_name="David Miller", date_of_birth=date(1965, 1, 30), biological_sex="male",
             phone="+1-555-0204", email="david@example.com", government_id="GOV-004"),
        dict(full_name="Emma Wilson", date_of_birth=date(2000, 6, 18), biological_sex="female",
             phone="+1-555-0205", email="emma@example.com", government_id="GOV-005"),
    ]
    for pd in patients_data:
        db.add(Patient(**pd))

    db.commit()
