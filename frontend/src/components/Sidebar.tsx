import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarPlus,
  ClipboardList,
  Clock,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard', roles: ['admin', 'receptionist', 'practitioner', 'patient'] },
  { to: '/patients', icon: <Users className="h-5 w-5" />, label: 'Patients', roles: ['admin', 'receptionist'] },
  { to: '/appointments', icon: <Calendar className="h-5 w-5" />, label: 'Appointments', roles: ['admin', 'receptionist', 'practitioner', 'patient'] },
  { to: '/appointments/new', icon: <CalendarPlus className="h-5 w-5" />, label: 'New Appointment', roles: ['admin', 'receptionist'] },
  { to: '/waiting-room', icon: <Clock className="h-5 w-5" />, label: 'Waiting Room', roles: ['admin', 'receptionist', 'practitioner'] },
  { to: '/schedule', icon: <ClipboardList className="h-5 w-5" />, label: 'Schedule', roles: ['admin', 'practitioner'] },
];

export function Sidebar() {
  const { user } = useAuth();

  const filteredItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      <nav className="flex-1 px-4 py-6 space-y-1">
        {filteredItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
