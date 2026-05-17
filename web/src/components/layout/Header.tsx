'use client';

import { useSession } from 'next-auth/react';
import { NotificationBell } from './notification-bell';
import { SeatSwitcher } from './SeatSwitcher';

export function Header() {
  const { data: session, status } = useSession();
  const user = session?.user;

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Vendor Rebate System</h1>
            <span className="text-xs uppercase tracking-wider text-gray-400 px-2 py-0.5 border border-gray-200 rounded">
              Prototype
            </span>
          </div>
          <div className="flex items-center gap-2">
            {status === 'authenticated' && user && (
              <>
                <NotificationBell userId={user.id} />
                <SeatSwitcher
                  name={user.name}
                  role={user.role}
                  analystCode={user.analystCode}
                  email={user.email}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
