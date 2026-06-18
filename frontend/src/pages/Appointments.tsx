import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { getAppointments, cancelAppointment, getPractitioners } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Toast } from '../components/Toast';
import type { Appointment, Practitioner, AppointmentStatus } from '../types';
import type { ToastType } from '../components/Toast';

const ALL_STATUSES: { value: AppointmentStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_waiting_room', label: 'Waiting Room' },
  { value: 'in_consultation', label: 'In Consultation' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
];

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const [filters, setFilters] = useState({
    status: '' as AppointmentStatus | '',
    date_from: '',
    date_to: '',
    practitioner_id: '' as number | '',
  });

  const size = 15;

  const fetchAppointments = useCallback(() => {
    setLoading(true);
    getAppointments({
      status: filters.status || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      practitioner_id: filters.practitioner_id || undefined,
      page,
      size,
    })
      .then((r) => {
        setAppointments(r.data.items);
        setTotal(r.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);
  useEffect(() => {
    getPractitioners().then((r) => setPractitioners(r.data)).catch(() => {});
  }, []);

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await cancelAppointment(id);
      setToast({ message: 'Appointment cancelled', type: 'success' });
      fetchAppointments();
    } catch {
      setToast({ message: 'Failed to cancel appointment', type: 'error' });
    }
  };

  const totalPages = Math.ceil(total / size);

  return (
    <div className="space-y-5">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <Link
          to="/appointments/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Appointment
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={filters.status}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value as AppointmentStatus | '' }); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ALL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => { setFilters({ ...filters, date_from: e.target.value }); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="From date"
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => { setFilters({ ...filters, date_to: e.target.value }); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="To date"
          />
          <select
            value={filters.practitioner_id}
            onChange={(e) => { setFilters({ ...filters, practitioner_id: e.target.value ? Number(e.target.value) : '' }); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Practitioners</option>
            {practitioners.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-600" />
          </div>
        ) : appointments.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No appointments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Patient</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Practitioner</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Specialty</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Date & Time</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{a.patient.full_name}</td>
                    <td className="px-5 py-3 text-gray-600">{a.practitioner.full_name}</td>
                    <td className="px-5 py-3 text-gray-600">{a.specialty.name}</td>
                    <td className="px-5 py-3 text-gray-600">{format(new Date(a.scheduled_at), 'MMM d, yyyy HH:mm')}</td>
                    <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show' && (
                        <button
                          onClick={() => handleCancel(a.id)}
                          className="text-xs px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                Previous
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
