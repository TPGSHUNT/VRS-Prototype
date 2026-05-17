// /login — kept as the single auth path but it is no longer a gate. Real VRS
// has no login screen (SSO-only, Ken); the role grid contradicted the
// "exactly like production VRS" thesis. This now auto-establishes a default
// SSO seat and drops straight into the field. Seat changes happen live via
// the in-header SeatSwitcher. (docs/20 P2.3, memory
// project_no_login_seat_switcher. The old role-select.tsx / role-card.tsx /
// role-user-picker.tsx are now unused — left in place pending a cleanup ask.)

import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { getDefaultSeatEmail } from '@/lib/seats';
import { SsoEnter } from './sso-enter';

export default async function LoginPage() {
  // Already signed in (or arrived here mid-session) → don't clobber the seat.
  const session = await auth();
  if (session?.user) redirect('/');

  const email = await getDefaultSeatEmail();
  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">
          No active users in the database — run the real-data load
          (`prisma/ingest/real_ingest.py` + `npm run db:load-acm`).
        </p>
      </div>
    );
  }
  return <SsoEnter email={email} />;
}
