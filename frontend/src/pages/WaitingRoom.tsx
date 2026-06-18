import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { getWaitingRoom, transitionStatus } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Toast } from '../components/Toast';
import type { Appointment, AppointmentStatus } from '../types';
import type { ToastType } from '../components/Toast';

const TRANSITIONS: Record<AppointmentStatus, { label: string; next: AppointmentStatus }[]> = {
  pending: [{ label: '→ Check In', next: 'in_waiting_room' }],
  in_waiting_room: [{ label: '→ Consult', next: 'in_consultation' }],
  in_consultation: [
    { label: '✓ Complete', next: 'completed' },
    { label: '✗ No Show', next: 'no_show' },
  ],
  completed: [],
  cancelled: [],
  no_show: [],
};

export default function WaitingRoom() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(() => {
    setLoading(true);
    getWaitingRoom()
      .then((r) => {
        const sorted = [...r.data].sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        );
        setAppointments(sorted);
        setLastRefresh(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTransition = async (id: number, status: AppointmentStatus) => {
    try {
      await transitionStatus(id, status);
      setToast({ message: 'Status updated', type: 'success' });
      fetchData();
    } catch {
      setToast({ message: 'Failed to update status', type: 'error' });
    }
  };

  const statusOrder: AppointmentStatus[] = ['pending', 'in_waiting_room', 'in_consultation', 'completed', 'no_show'];
  const grouped = statusOrder.reduce((acc, s) => {
    acc[s] = appointments.filter((a) => a.status === s);
    return acc;
  }, {} as Record<AppointmentStatus, Appointment[]>);

  return (
    <div className="space-y-5">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Waiting Room</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Last updated: {format(lastRefresh, 'HH:mm:ss')} · Auto-refreshes every 30s
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && appointments.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {(['pending', 'in_waiting_room', 'in_consultation'] as AppointmentStatus[]).map((status) => {
            const group = grouped[status];
            if (group.length === 0) return null;
            return (
              <div key={status} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <StatusBadge status={status} />
                  <span className="text-sm font-medium text-gray-600">({group.length})</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {group.map((a) => (
                    <div key={a.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{a.patient.full_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {a.practitioner.full_name} · {a.specialty.name} · {format(new Date(a.scheduled_at), 'HH:mm')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {TRANSITIONS[status].map((t) => (
                          <button
                            key={t.next}
                            onClick={() => handleTransition(a.id, t.next)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                              t.next === 'completed'
                                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                : t.next === 'no_show'
                                ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {(['completed', 'no_show'] as AppointmentStatus[]).map((status) => {
            const group = grouped[status];
            if (group.length === 0) return null;
            return (
              <div key={status} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden opacity-70">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <StatusBadge status={status} />
                  <span className="text-sm font-medium text-gray-600">({group.length})</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {group.map((a) => (
                    <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700">{a.patient.full_name}</p>
                      <span className="text-xs text-gray-400">· {format(new Date(a.scheduled_at), 'HH:mm')}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {appointments.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-gray-500">No appointments in the waiting room today.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
