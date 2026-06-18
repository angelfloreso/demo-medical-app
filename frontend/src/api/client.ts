import axios from 'axios';
import type { User, Patient, Practitioner, Specialty, Branch, Appointment, ScheduleBlock, TimeSlot, PaginatedResponse, AppointmentStatus } from '../types';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email: string, password: string) =>
  api.post<{ access_token: string; token_type: string }>('/auth/login', { email, password });

export const register = (data: { email: string; password: string; full_name: string; role: string }) =>
  api.post<User>('/auth/register', data);

export const getMe = () => api.get<User>('/auth/me');

// Patients
export const getPatients = (params?: { search?: string; page?: number; size?: number }) =>
  api.get<PaginatedResponse<Patient>>('/patients', { params });

export const getPatient = (id: number) => api.get<Patient>(`/patients/${id}`);

export const createPatient = (data: Partial<Patient>) => api.post<Patient>('/patients', data);

export const updatePatient = (id: number, data: Partial<Patient>) =>
  api.put<Patient>(`/patients/${id}`, data);

export const deletePatient = (id: number) => api.delete(`/patients/${id}`);

// Practitioners
export const getPractitioners = (params?: { specialty_id?: number }) =>
  api.get<Practitioner[]>('/practitioners', { params });

export const getPractitioner = (id: number) => api.get<Practitioner>(`/practitioners/${id}`);

export const getAvailableSlots = (practitionerId: number, date: string) =>
  api.get<TimeSlot[]>(`/practitioners/${practitionerId}/available-slots`, { params: { date } });

// Specialties
export const getSpecialties = () => api.get<Specialty[]>('/specialties');

// Branches
export const getBranches = () => api.get<Branch[]>('/branches');

// Appointments
export const getAppointments = (params?: {
  status?: string;
  date_from?: string;
  date_to?: string;
  practitioner_id?: number;
  patient_id?: number;
  page?: number;
  size?: number;
}) => api.get<PaginatedResponse<Appointment>>('/appointments', { params });

export const getAppointment = (id: number) => api.get<Appointment>(`/appointments/${id}`);

export const createAppointment = (data: {
  patient_id: number;
  practitioner_id: number;
  scheduled_at: string;
  duration_minutes?: number;
  notes?: string;
}) => api.post<Appointment>('/appointments', data);

export const updateAppointment = (id: number, data: Partial<Appointment>) =>
  api.put<Appointment>(`/appointments/${id}`, data);

export const cancelAppointment = (id: number) =>
  api.post<Appointment>(`/appointments/${id}/cancel`);

export const transitionStatus = (id: number, status: AppointmentStatus) =>
  api.post<Appointment>(`/appointments/${id}/transition`, { status });

// Waiting Room
export const getWaitingRoom = () => api.get<Appointment[]>('/waiting-room');

export const updateAppointmentStatus = (id: number, status: AppointmentStatus) =>
  transitionStatus(id, status);

// Schedule Blocks
export const getBlocks = (practitionerId: number) =>
  api.get<ScheduleBlock[]>(`/practitioners/${practitionerId}/blocks`);

export const createBlock = (data: {
  practitioner_id: number;
  start_time: string;
  end_time: string;
  reason?: string;
}) => api.post<ScheduleBlock>('/schedule-blocks', data);

export const deleteBlock = (id: number) => api.delete(`/schedule-blocks/${id}`);

export default api;
