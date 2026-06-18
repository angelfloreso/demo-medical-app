from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, SessionLocal
from .models import (  # noqa: F401 – ensure all tables are registered
    User, Patient, Specialty, Branch, Practitioner, WorkingHours,
    ScheduleBlock, Appointment,
)
from .database import Base
from .routers import auth, patients, practitioners, appointments, waiting_room, schedule, specialties
from .seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="MedSched API",
    description="Medical Appointment Management System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(practitioners.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(waiting_room.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(specialties.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok"}
