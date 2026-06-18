import React from 'react';
import type { AppointmentStatus } from '../types';

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  in_waiting_room: { label: 'Waiting Room', className: 'bg-blue-100 text-blue-800' },
  in_consultation: { label: 'In Consultation', className: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700' },
  no_show: { label: 'No Show', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const cfg = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
