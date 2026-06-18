import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { format } from 'date-fns';
import {
  getSpecialties,
  getPractitioners,
  getAvailableSlots,
  getPatients,
  createAppointment,
} from '../api/client';
import { Toast } from '../components/Toast';
import type { Specialty, Practitioner, Patient, TimeSlot } from '../types';
import type { ToastType } from '../components/Toast';

const STEPS = ['Specialty', 'Practitioner', 'Date', 'Time Slot', 'Patient', 'Confirm'];

export default function NewAppointment() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');

  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null);
  const [selectedPractitioner, setSelectedPractitioner] = useState<Practitioner | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getSpecialties().then((r) => setSpecialties(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedSpecialty) {
      getPractitioners({ specialty_id: selectedSpecialty.id })
        .then((r) => setPractitioners(r.data))
        .catch(() => {});
    }
  }, [selectedSpecialty]);

  useEffect(() => {
    if (selectedPractitioner && selectedDate) {
      getAvailableSlots(selectedPractitioner.id, selectedDate)
        .then((r) => setSlots(r.data))
        .catch(() => setSlots([]));
    }
  }, [selectedPractitioner, selectedDate]);

  useEffect(() => {
    getPatients({ search: patientSearch || undefined, size: 20 })
      .then((r) => setPatients(r.data.items))
      .catch(() => {});
  }, [patientSearch]);

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedPractitioner || !selectedSlot) return;
    setSubmitting(true);
    try {
      await createAppointment({
        patient_id: selectedPatient.id,
        practitioner_id: selectedPractitioner.id,
        scheduled_at: selectedSlot.start,
        notes,
      });
      setToast({ message: 'Appointment booked successfully!', type: 'success' });
      setTimeout(() => navigate('/appointments'), 1500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (axiosErr.response?.status === 409) {
        setToast({ message: `Scheduling conflict: ${axiosErr.response.data?.detail ?? 'The selected slot is no longer available.'}`, type: 'error' });
      } else {
        setToast({ message: 'Failed to book appointment. Please try again.', type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 0) return !!selectedSpecialty;
    if (step === 1) return !!selectedPractitioner;
    if (step === 2) return !!selectedDate;
    if (step === 3) return !!selectedSlot;
    if (step === 4) return !!selectedPatient;
    return true;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="text-2xl font-bold text-gray-900">New Appointment</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${i === step ? 'text-blue-600' : i < step ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </React.Fragment>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[280px]">
        {/* Step 0: Specialty */}
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 mb-4">Select Specialty</h2>
            {specialties.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSpecialty(s)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${selectedSpecialty?.id === s.id ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Practitioner */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 mb-4">Select Practitioner</h2>
            {practitioners.length === 0 ? (
              <p className="text-gray-500 text-sm">No practitioners available for this specialty.</p>
            ) : practitioners.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPractitioner(p)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${selectedPractitioner?.id === p.id ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <p className="font-medium">{p.full_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.branch?.name}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Date */}
        {step === 2 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select Date</h2>
            <input
              type="date"
              min={format(new Date(), 'yyyy-MM-dd')}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Step 3: Time slot */}
        {step === 3 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select Time Slot</h2>
            {slots.length === 0 ? (
              <p className="text-gray-500 text-sm">No available slots for this date.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedSlot?.start === slot.start ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                  >
                    {format(new Date(slot.start), 'HH:mm')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Patient */}
        {step === 4 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 mb-2">Select Patient</h2>
            <input
              type="text"
              placeholder="Search patient by name or email…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatient(p)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${selectedPatient?.id === p.id ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-xs text-gray-500">{p.email}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 mb-4">Confirm Appointment</h2>
            <div className="space-y-2 text-sm">
              {[
                ['Specialty', selectedSpecialty?.name],
                ['Practitioner', selectedPractitioner?.full_name],
                ['Date', selectedDate ? format(new Date(selectedDate), 'MMMM d, yyyy') : ''],
                ['Time', selectedSlot ? format(new Date(selectedSlot.start), 'HH:mm') : ''],
                ['Patient', selectedPatient?.full_name],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            <Check className="h-4 w-4" />
            {submitting ? 'Booking…' : 'Book Appointment'}
          </button>
        )}
      </div>
    </div>
  );
}
