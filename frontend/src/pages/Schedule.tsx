import React, { useEffect, useState, useCallback } from 'react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { getAppointments, getPractitioners, getBlocks, createBlock, deleteBlock } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Toast } from '../components/Toast';
import { useAuth } from '../auth/AuthContext';
import type { Appointment, Practitioner, ScheduleBlock } from '../types';
import type { ToastType } from '../components/Toast';

export default function Schedule() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [practitionerId, setPractitionerId] = useState<number | ''>('');
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [blockForm, setBlockForm] = useState({ start_time: '', end_time: '', reason: '' });

  useEffect(() => {
    getPractitioners()
      .then((r) => {
        setPractitioners(r.data);
        if (user?.role === 'practitioner') {
          const me = r.data.find((p) => p.email === user.email);
          if (me) setPractitionerId(me.id);
        }
      })
      .catch(() => {});
  }, [user]);

  const fetchSchedule = useCallback(() => {
    if (!practitionerId) return;
    setLoading(true);
    Promise.all([
      getAppointments({
        practitioner_id: practitionerId,
        date_from: selectedDate,
        date_to: selectedDate,
        size: 50,
      }),
      getBlocks(practitionerId),
    ])
      .then(([aRes, bRes]) => {
        setAppointments(aRes.data.items);
        setBlocks(bRes.data.filter((b) => b.start_time.startsWith(selectedDate)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [practitionerId, selectedDate]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!practitionerId) return;
    try {
      const datePrefix = selectedDate + 'T';
      await createBlock({
        practitioner_id: Number(practitionerId),
        start_time: datePrefix + blockForm.start_time + ':00',
        end_time: datePrefix + blockForm.end_time + ':00',
        reason: blockForm.reason,
      });
      setToast({ message: 'Block created', type: 'success' });
      setShowBlockModal(false);
      setBlockForm({ start_time: '', end_time: '', reason: '' });
      fetchSchedule();
    } catch {
      setToast({ message: 'Failed to create block', type: 'error' });
    }
  };

  const handleDeleteBlock = async (id: number) => {
    try {
      await deleteBlock(id);
      setToast({ message: 'Block deleted', type: 'success' });
      fetchSchedule();
    } catch {
      setToast({ message: 'Failed to delete block', type: 'error' });
    }
  };

  const weekStart = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-5">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        {practitionerId && (
          <button
            onClick={() => setShowBlockModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Block Time
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        {user?.role !== 'practitioner' && (
          <select
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Practitioner</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        )}

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), -7), 'yyyy-MM-dd'))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1">
            {weekDays.map((d) => {
              const ds = format(d, 'yyyy-MM-dd');
              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(ds)}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    ds === selectedDate
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span>{format(d, 'EEE')}</span>
                  <span>{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 7), 'yyyy-MM-dd'))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!practitionerId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
          Select a practitioner to view their schedule.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Appointments — {format(parseISO(selectedDate), 'MMMM d, yyyy')}</h2>
            </div>
            {appointments.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">No appointments on this day.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {appointments
                  .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                  .map((a) => (
                    <div key={a.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{a.patient.full_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.specialty.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-700">{format(new Date(a.scheduled_at), 'HH:mm')}</p>
                          <div className="mt-1"><StatusBadge status={a.status} /></div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Blocked Intervals</h2>
            </div>
            {blocks.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">No blocked intervals on this day.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {blocks.map((b) => (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(b.start_time), 'HH:mm')} – {format(new Date(b.end_time), 'HH:mm')}
                      </p>
                      {b.reason && <p className="text-xs text-gray-500 mt-0.5">{b.reason}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteBlock(b.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Block Time on {format(parseISO(selectedDate), 'MMM d, yyyy')}</h2>
              <button onClick={() => setShowBlockModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateBlock} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={blockForm.start_time}
                    onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={blockForm.end_time}
                    onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Lunch break"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Create Block
                </button>
                <button type="button" onClick={() => setShowBlockModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
