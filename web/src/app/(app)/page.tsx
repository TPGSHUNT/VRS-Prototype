// Landing surface — the bubble field is THE work surface (per /docs/06-design-language.md §1.1).

import Link from 'next/link';
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { getBubbleData } from '@/lib/bubble-data';
import { WorkSurface } from '@/components/bubble-field/WorkSurface';

export default async function BubbleFieldLanding({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const showAll = (await searchParams).scope === 'all';
  const { bubbles, scope } = await getBubbleData({
    userId: session.user.id,
    role: session.user.role,
    showAll,
  });

  const totalEarnings = bubbles.reduce((s, b) => s + b.metrics.annualEarnings, 0);
  const queuePending = bubbles.filter((b) => b.queuePending).length;
  const healthCounts = {
    red: bubbles.filter((b) => b.health === 'RED').length,
    amber: bubbles.filter((b) => b.health === 'AMBER').length,
    green: bubbles.filter((b) => b.health === 'GREEN').length,
  };

  return (
    <div className="h-full flex flex-col">
      {/* KPI strip — derived from the bubble data */}
      <div className="border-b border-gray-200 px-6 py-4 bg-white">
        <div className="grid grid-cols-5 gap-6 max-w-6xl">
          <KpiCard label="Vendors in scope" value={bubbles.length.toLocaleString()} />
          <KpiCard label="Total earnings YTD" value={formatMoney(totalEarnings)} />
          <KpiCard
            label="Awaiting AP approval"
            value={queuePending.toLocaleString()}
            accent="amber"
          />
          <KpiCard
            label="Critical attention"
            value={healthCounts.red.toLocaleString()}
            accent="red"
          />
          <KpiCard
            label="Healthy"
            value={healthCounts.green.toLocaleString()}
            accent="green"
          />
        </div>

        {scope.tier === 'operator' && (
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
            {scope.showingAll ? (
              <>
                <span>
                  Estate view · all{' '}
                  <span className="font-semibold text-gray-700">
                    {scope.totalCount.toLocaleString()}
                  </span>{' '}
                  vendors ·{' '}
                  <span className="text-gray-400">
                    your {scope.scopedCount.toLocaleString()}
                  </span>
                </span>
                <Link
                  href="/"
                  className="rounded border border-gray-300 px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50"
                >
                  Show only mine
                </Link>
              </>
            ) : (
              <>
                <span>
                  Your view ·{' '}
                  <span className="font-semibold text-gray-700">
                    {scope.scopedCount.toLocaleString()}
                  </span>{' '}
                  of {scope.totalCount.toLocaleString()} vendors
                </span>
                <Link
                  href="/?scope=all"
                  className="rounded border border-gray-300 px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50"
                >
                  Show all
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bubble field viewport — quadrant layout, axis-selectable via toolbar */}
      <div className="flex-1 relative bg-gradient-to-br from-gray-50/80 via-white to-gray-50/60">
        <WorkSurface vendors={bubbles} role={session.user.role} />
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
  value: string;
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
      <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${accentClass}`}>{value}</div>
    </div>
  );
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
