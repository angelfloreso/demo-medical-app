export type Role = 'admin' | 'receptionist' | 'practitioner' | 'patient';

export type AppointmentStatus =
  | 'pending'
  | 'in_waiting_room'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
}

export interface Specialty {
  id: number;
  name: string;
  description?: string;
}

export interface Branch {
  id: number;
  name: string;
  address?: string;
  phone?: string;
}

export interface WorkingHours {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Practitioner {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  specialty: Specialty;
  branch: Branch;
  working_hours?: WorkingHours[];
}

export interface Patient {
  id: number;
  user_id?: number;
  full_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  allergies?: string;
  notes?: string;
}

export interface Appointment {
  id: number;
  patient: Patient;
  practitioner: Practitioner;
  specialty: Specialty;
  branch: Branch;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  notes?: string;
  created_at: string;
}

export interface ScheduleBlock {
  id: number;
  practitioner_id: number;
  start_time: string;
  end_time: string;
  reason?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
