from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..database import get_db
from ..models import Patient, User
from ..schemas import PatientCreate, PatientRead, PatientUpdate

router = APIRouter(prefix="/patients", tags=["patients"])


def _get_or_404(patient_id: str, db: Session) -> Patient:
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


def _check_duplicate(db: Session, email: str, government_id: Optional[str], exclude_id: Optional[str] = None):
    q = db.query(Patient).filter(Patient.email == email)
    if exclude_id:
        q = q.filter(Patient.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail="A patient with this email already exists")
    if government_id:
        q2 = db.query(Patient).filter(Patient.government_id == government_id)
        if exclude_id:
            q2 = q2.filter(Patient.id != exclude_id)
        if q2.first():
            raise HTTPException(status_code=400, detail="A patient with this government ID already exists")


@router.get("", response_model=List[PatientRead])
def list_patients(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist", "practitioner")),
):
    q = db.query(Patient).filter(Patient.is_active == True)
    if search:
        like = f"%{search}%"
        q = q.filter((Patient.full_name.ilike(like)) | (Patient.email.ilike(like)))
    return q.offset(skip).limit(limit).all()


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist")),
):
    _check_duplicate(db, payload.email, payload.government_id)
    patient = Patient(**payload.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist", "practitioner")),
):
    return _get_or_404(patient_id, db)


@router.put("/{patient_id}", response_model=PatientRead)
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "receptionist")),
):
    patient = _get_or_404(patient_id, db)
    updates = payload.model_dump(exclude_unset=True)
    _check_duplicate(
        db,
        updates.get("email", patient.email),
        updates.get("government_id", patient.government_id),
        exclude_id=patient_id,
    )
    for k, v in updates.items():
        setattr(patient, k, v)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    patient = _get_or_404(patient_id, db)
    patient.is_active = False
    db.commit()
