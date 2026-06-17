import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
# SECURITY: Set API_KEY env var to a strong random value in production.
API_KEY = os.environ.get("API_KEY", "demo-insecure-key-CHANGE-IN-PRODUCTION")

# Comma-separated list of allowed CORS origins.
# Example: ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
# Leave empty (default) to block all cross-origin requests.
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

# ── Rate limiter (in-memory, per-IP, demo) ────────────────────────────────────
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW = 60  # seconds


def _enforce_rate_limit(ip: str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - RATE_LIMIT_WINDOW
    recent = [t for t in _rate_store[ip] if t > cutoff]
    recent.append(now)
    _rate_store[ip] = recent
    if len(recent) > RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Retry after 1 minute.",
        )


# ── API-key authentication ─────────────────────────────────────────────────────
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(
    request: Request,
    api_key: str = Security(_api_key_header),
) -> str:
    """Validate API key and enforce per-IP rate limit."""
    client_ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(client_ip)
    if not api_key or api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key.",
        )
    return api_key


# ── Pydantic models with input validation ─────────────────────────────────────
class PatientCreate(BaseModel):
    name: str = Field(..., max_length=100)
    age: int = Field(..., ge=0, le=150)
    diagnosis: str = Field(..., max_length=500)
    doctor: str = Field(..., max_length=100)


class Patient(PatientCreate):
    id: str  # UUID4 string — prevents sequential-ID enumeration (IDOR)


class AppointmentCreate(BaseModel):
    patient_id: str
    doctor: str = Field(..., max_length=100)
    # Enforce YYYY-MM-DD format to prevent injection via date field
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: str = Field(..., max_length=1000)


class Appointment(AppointmentCreate):
    id: str  # UUID4 string


# ── In-memory stores ──────────────────────────────────────────────────────────
patients: dict[str, Patient] = {}
appointments: dict[str, Appointment] = {}


# ── Structured audit logging ──────────────────────────────────────────────────
def _audit(
    action: str,
    method: str,
    endpoint: str,
    result: str,
    resource_id: Optional[str] = None,
) -> None:
    """Emit a structured JSON audit log entry (HIPAA access tracking)."""
    logger.info(
        '{"timestamp": "%s", "action": "%s", "method": "%s", "endpoint": "%s", '
        '"resource_id": "%s", "result": "%s"}',
        datetime.now(timezone.utc).isoformat(),
        action,
        method,
        endpoint,
        resource_id or "",
        result,
    )


# ── Security headers middleware ───────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response


# ── FastAPI application ───────────────────────────────────────────────────────
app = FastAPI(
    title="Medical App API",
    description="A simple REST service demo for managing patients and appointments.",
    version="1.0.0",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["X-API-Key", "Content-Type"],
)


# ── Global error handler (no internal detail leakage) ─────────────────────────
@app.exception_handler(Exception)
async def _global_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        '{"timestamp": "%s", "event": "unhandled_exception", "path": "%s", "error": "%s"}',
        datetime.now(timezone.utc).isoformat(),
        request.url.path,
        repr(exc),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please contact support."},
    )


# ── Health check (no auth required) ──────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


# ── Patient endpoints (all require API key) ───────────────────────────────────
@app.get("/patients", response_model=list[Patient], tags=["Patients"])
def list_patients(
    request: Request,
    _: str = Depends(require_api_key),
):
    _audit("list_patients", "GET", "/patients", "success")
    return list(patients.values())


@app.post(
    "/patients",
    response_model=Patient,
    status_code=status.HTTP_201_CREATED,
    tags=["Patients"],
)
def create_patient(
    request: Request,
    payload: PatientCreate,
    _: str = Depends(require_api_key),
):
    pid = str(uuid.uuid4())
    patient = Patient(id=pid, **payload.model_dump())
    patients[pid] = patient
    _audit("create_patient", "POST", "/patients", "success", pid)
    return patient


@app.get("/patients/{patient_id}", response_model=Patient, tags=["Patients"])
def get_patient(
    request: Request,
    patient_id: str,
    _: str = Depends(require_api_key),
):
    patient = patients.get(patient_id)
    if not patient:
        _audit("get_patient", "GET", f"/patients/{patient_id}", "not_found", patient_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    _audit("get_patient", "GET", f"/patients/{patient_id}", "success", patient_id)
    return patient


@app.put("/patients/{patient_id}", response_model=Patient, tags=["Patients"])
def update_patient(
    request: Request,
    patient_id: str,
    payload: PatientCreate,
    _: str = Depends(require_api_key),
):
    if patient_id not in patients:
        _audit(
            "update_patient", "PUT", f"/patients/{patient_id}", "not_found", patient_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    updated = Patient(id=patient_id, **payload.model_dump())
    patients[patient_id] = updated
    _audit("update_patient", "PUT", f"/patients/{patient_id}", "success", patient_id)
    return updated


@app.delete(
    "/patients/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Patients"],
)
def delete_patient(
    request: Request,
    patient_id: str,
    _: str = Depends(require_api_key),
):
    if patient_id not in patients:
        _audit(
            "delete_patient",
            "DELETE",
            f"/patients/{patient_id}",
            "not_found",
            patient_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    del patients[patient_id]
    _audit(
        "delete_patient", "DELETE", f"/patients/{patient_id}", "success", patient_id
    )


# ── Appointment endpoints (all require API key) ───────────────────────────────
@app.get("/appointments", response_model=list[Appointment], tags=["Appointments"])
def list_appointments(
    request: Request,
    _: str = Depends(require_api_key),
):
    _audit("list_appointments", "GET", "/appointments", "success")
    return list(appointments.values())


@app.post(
    "/appointments",
    response_model=Appointment,
    status_code=status.HTTP_201_CREATED,
    tags=["Appointments"],
)
def create_appointment(
    request: Request,
    payload: AppointmentCreate,
    _: str = Depends(require_api_key),
):
    if payload.patient_id not in patients:
        _audit(
            "create_appointment",
            "POST",
            "/appointments",
            "patient_not_found",
            payload.patient_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    aid = str(uuid.uuid4())
    appointment = Appointment(id=aid, **payload.model_dump())
    appointments[aid] = appointment
    _audit("create_appointment", "POST", "/appointments", "success", aid)
    return appointment
