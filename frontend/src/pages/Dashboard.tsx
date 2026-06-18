import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { getAppointments, getWaitingRoom } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import type { Appointment } from '../types';

interface Stat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  link: string;
}

export default function Dashboard() {
  const [todayCount, setTodayCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [upcoming, setUpcoming] = useState(0);
  const [recent, setRecent] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    Promise.all([
      getAppointments({ date_from: today, date_to: today, size: 100 }),
      getWaitingRoom(),
    ])
      .then(([apptRes, waitRes]) => {
        const appts = apptRes.data.items;
        setTodayCount(apptRes.data.total);
        setWaitingCount(waitRes.data.length);
        setCompletedCount(appts.filter((a) => a.status === 'completed').length);
        setUpcoming(appts.filter((a) => a.status === 'pending').length);
        setRecent(appts.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats: Stat[] = [
    { label: "Today's Appointments", value: todayCount, icon: <Calendar className="h-6 w-6" />, color: 'bg-blue-500', link: '/appointments' },
    { label: 'In Waiting Room', value: waitingCount, icon: <Clock className="h-6 w-6" />, color: 'bg-yellow-500', link: '/waiting-room' },
    { label: 'Completed Today', value: completedCount, icon: <CheckCircle className="h-6 w-6" />, color: 'bg-green-500', link: '/appointments' },
    { label: 'Pending', value: upcoming, icon: <Users className="h-6 w-6" />, color: 'bg-purple-500', link: '/appointments' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <Link key={s.label} to={s.link} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-4">
                <div className={`${s.color} text-white p-3 rounded-xl`}>{s.icon}</div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-sm text-gray-500">{s.label}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Today's Appointments</h2>
              <Link to="/appointments" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
            {recent.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">No appointments today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Patient</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Practitioner</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Time</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((a) => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{a.patient.full_name}</td>
                        <td className="px-5 py-3 text-gray-600">{a.practitioner.full_name}</td>
                        <td className="px-5 py-3 text-gray-600">{format(new Date(a.scheduled_at), 'HH:mm')}</td>
                        <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
