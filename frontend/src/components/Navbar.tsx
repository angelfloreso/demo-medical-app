import React from 'react';
import { Stethoscope, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const roleBadgeColor: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  receptionist: 'bg-blue-100 text-blue-700',
  practitioner: 'bg-green-100 text-green-700',
  patient: 'bg-gray-100 text-gray-700',
};

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
        <Stethoscope className="h-6 w-6" />
        MedSched
      </div>
      {user && (
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                roleBadgeColor[user.role] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      )}
    </header>
  );
}
