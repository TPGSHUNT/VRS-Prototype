// Landing surface — the bubble field is THE work surface (per /docs/06-design-language.md §1.1).
// This is a Sprint 2 deliverable; for now it's a placeholder that confirms the AppShell
// layout, header, role-aware session, and notification bell all work end-to-end.

import { auth } from '../../../auth';
import { prisma } from '@vrs/db';
import { redirect } from 'next/navigation';

export default async function BubbleFieldLanding() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const counts = {
    vendors: await prisma.vendor.count(),
    rebatePrograms: await prisma.rebateProgram.count(),
    pendingApAgreements: await prisma.agreement.count({ where: { status: 'PENDING_AP_APPROVAL' } }),
    notifications: await prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  };

  return (
    <div className="h-full flex flex-col">
      {/* KPI strip placeholder — Sprint 2 will wire this to filtered set */}
      <div className="border-b border-gray-200 px-6 py-4 bg-white">
        <div className="grid grid-cols-4 gap-6 max-w-5xl">
          <KpiCard label="Vendors in scope" value={counts.vendors} />
          <KpiCard label="Active programs" value={counts.rebatePrograms} />
          <KpiCard label="Awaiting AP approval" value={counts.pendingApAgreements} accent="amber" />
          <KpiCard label="Unread notifications" value={counts.notifications} accent="blue" />
        </div>
      </div>

      {/* Bubble field viewport — placeholder until Sprint 2 */}
      <div className="flex-1 flex items-center justify-center bg-gray-50/50 relative">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">●</div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Vendor Bubble Field</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Sprint 2 lights this up — D3 force simulation, lasso select, role-lens filtering, and
            the right-slider vendor record. For now: shell, auth, header, and bell are wired.
          </p>
          <div className="mt-6 text-xs text-gray-500">
            Signed in as <span className="font-medium text-gray-700">{session.user.name}</span>
            {' · '}
            <span>{session.user.role.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </div>

      {/* Floating toolbar placeholder */}
      <div className="absolute bottom-4 left-4 right-4 z-20 p-3 bg-white/60 backdrop-blur-sm border border-gray-300 rounded-lg shadow-md flex items-center gap-2">
        <span className="text-xs text-gray-500 px-2">Toolbar (Filters · Layer · Mode · Vera) — Sprint 2</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = 'gray',
}: {
  label: string;
  value: number;
  accent?: 'gray' | 'blue' | 'amber' | 'red' | 'green';
}) {
  const accentClass = {
    gray: 'text-gray-900',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600',
  }[accent];
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accentClass}`}>{value.toLocaleString()}</div>
    </div>
  );
}
