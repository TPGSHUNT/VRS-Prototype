'use client';

// SSO entry shim. Real VRS has no login screen — the system just knows the
// user. We model that: no grid, no gate. On arrival we auto-establish a
// default seat (the AP-Manager estate showpiece) and drop straight into the
// field; the in-header SeatSwitcher is how you change seats from there.
// (memory project_no_login_seat_switcher, docs/20 P2.3.)

import { useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

export function SsoEnter({ email }: { email: string }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // guard StrictMode double-invoke
    started.current = true;
    void signIn('credentials', { email, redirect: true, redirectTo: '/' });
  }, [email]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex items-center gap-3 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <span className="text-sm">Establishing your session via SSO…</span>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        No login screen — exactly like production VRS. You can switch seats
        from the header once inside.
      </p>
    </div>
  );
}
