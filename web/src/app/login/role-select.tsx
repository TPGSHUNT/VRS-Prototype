'use client';

// Role-selection screen (NOT a login): left = roles, right = users in the
// chosen role, bottom = live background on the highlighted user + an explicit
// "Enter as …" confirm. Clicking a user only previews; the button loads.

import { signIn } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { getUserScopeSummary, type ScopeSummary } from '@/lib/role-select';

export interface RoleGroup {
  role: string;
  label: string;
  users: { email: string; name: string }[];
}

function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function RoleSelect({ groups }: { groups: RoleGroup[] }) {
  const [roleIdx, setRoleIdx] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [loadingSummary, startSummary] = useTransition();
  const [entering, setEntering] = useState(false);

  if (groups.length === 0) {
    return <p className="text-sm text-gray-500">No selectable users.</p>;
  }
  const group = groups[Math.min(roleIdx, groups.length - 1)]!;

  const pickRole = (i: number) => {
    setRoleIdx(i);
    setEmail(null);
    setSummary(null);
  };
  const pickUser = (e: string) => {
    setEmail(e);
    setSummary(null);
    startSummary(async () => setSummary(await getUserScopeSummary(e)));
  };
  const enter = async () => {
    if (!email) return;
    setEntering(true);
    await signIn('credentials', { email, redirect: true, redirectTo: '/' });
  };

  return (
    <div className="grid grid-cols-[210px_1fr] grid-rows-[minmax(320px,1fr)_auto] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      {/* Left — roles */}
      <div className="row-span-1 border-r border-gray-200 bg-gray-50/60 p-2 overflow-y-auto">
        <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Role
        </div>
        {groups.map((g, i) => (
          <button
            key={g.role}
            onClick={() => pickRole(i)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              i === roleIdx
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-200/70'
            }`}
          >
            <span>{g.label}</span>
            <span
              className={`text-xs ${i === roleIdx ? 'text-blue-100' : 'text-gray-400'}`}
            >
              {g.users.length}
            </span>
          </button>
        ))}
      </div>

      {/* Right — users in the selected role */}
      <div className="row-span-1 overflow-y-auto p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {group.label} — select a user
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {group.users.map((u) => (
            <button
              key={u.email}
              onClick={() => pickUser(u.email)}
              className={`truncate rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                email === u.email
                  ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
              title={u.name}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom — background on the selected user + confirm */}
      <div className="col-span-2 border-t border-gray-200 bg-gray-50 p-5">
        {!email ? (
          <p className="text-sm text-gray-400">
            Select a user to see their book.
          </p>
        ) : loadingSummary || !summary ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading {`their book…`}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-gray-900">
                {summary.name}
                <span className="ml-2 text-xs font-medium uppercase tracking-wider text-blue-600">
                  {summary.roleLabel}
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {summary.kind === 'estate'
                  ? 'Entire estate · '
                  : 'Book · '}
                <strong>{summary.vendorCount.toLocaleString()}</strong> vendors
                {summary.programCount > 0 && (
                  <> · {summary.programCount.toLocaleString()} programs</>
                )}
                {summary.agreementCount > 0 && (
                  <> · {summary.agreementCount.toLocaleString()} agreements</>
                )}
                {summary.annualEarnings > 0 && (
                  <> · {money(summary.annualEarnings)} earned</>
                )}
                {summary.contractValue > 0 && (
                  <> · {money(summary.contractValue)} contracted</>
                )}
              </div>
              {summary.sampleVendors.length > 0 && (
                <div className="mt-1 text-xs text-gray-400">
                  e.g. {summary.sampleVendors.join(' · ')}
                </div>
              )}
            </div>
            <button
              onClick={enter}
              disabled={entering}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              {entering && <Loader2 className="h-4 w-4 animate-spin" />}
              Enter as {summary.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
