from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..database import get_db
from ..models import Specialty, Branch, User
from ..schemas import (
    SpecialtyCreate, SpecialtyRead, SpecialtyUpdate,
    BranchCreate, BranchRead, BranchUpdate,
)

router = APIRouter(tags=["specialties & branches"])


# ── Specialties ───────────────────────────────────────────────────────────────

@router.get("/specialties", response_model=List[SpecialtyRead])
def list_specialties(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Specialty).all()


@router.post("/specialties", response_model=SpecialtyRead, status_code=status.HTTP_201_CREATED)
def create_specialty(
    payload: SpecialtyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    if db.query(Specialty).filter(Specialty.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Specialty already exists")
    s = Specialty(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/specialties/{specialty_id}", response_model=SpecialtyRead)
def get_specialty(specialty_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(Specialty).filter(Specialty.id == specialty_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Specialty not found")
    return s


@router.put("/specialties/{specialty_id}", response_model=SpecialtyRead)
def update_specialty(
    specialty_id: str,
    payload: SpecialtyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    s = db.query(Specialty).filter(Specialty.id == specialty_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Specialty not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/specialties/{specialty_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_specialty(
    specialty_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    s = db.query(Specialty).filter(Specialty.id == specialty_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Specialty not found")
    db.delete(s)
    db.commit()


# ── Branches ──────────────────────────────────────────────────────────────────

@router.get("/branches", response_model=List[BranchRead])
def list_branches(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Branch).all()


@router.post("/branches", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    b = Branch(**payload.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.get("/branches/{branch_id}", response_model=BranchRead)
def get_branch(branch_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    return b


@router.put("/branches/{branch_id}", response_model=BranchRead)
def update_branch(
    branch_id: str,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(
    branch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    db.delete(b)
    db.commit()
