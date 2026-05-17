'use client';

// Persistent in-header seat switcher (docs/20 P2.3, memory
// project_no_login_seat_switcher). Real VRS has no login screen — SSO just
// knows the user; here you can hop seats live and the bubble field visibly
// re-shapes (estate ⇄ operator) without leaving the surface.

import { useState, useTransition } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Check, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { getSeatGroups, type SeatGroup } from '@/lib/seats';
import { getUserScopeSummary, type ScopeSummary } from '@/lib/role-select';

const ROLE_LABEL: Record<string, string> = {
  AP_ANALYST: 'AP Analyst',
  AP_MANAGER: 'AP Manager',
  BUYER: 'Buyer',
  BUYER_DELEGATE: 'Buyer Delegate',
  DMM: 'District Merch Manager',
  GMM: 'General Merch Manager',
  READ_ONLY: 'Finance / Audit (read-only)',
};

function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  name: string;
  role: string;
  analystCode: string | null;
  email: string;
}

export function SeatSwitcher({ name, role, analystCode, email }: Props) {
  const { update } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SeatGroup[] | null>(null);
  const [roleIdx, setRoleIdx] = useState(0);
  const [previewEmail, setPreviewEmail] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [loadingGroups, startGroups] = useTransition();
  const [loadingSummary, startSummary] = useTransition();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && groups === null) {
      startGroups(async () => setGroups(await getSeatGroups()));
    }
  }

  function pickRole(i: number) {
    setRoleIdx(i);
    setPreviewEmail(null);
    setSummary(null);
  }
  function preview(e: string) {
    setPreviewEmail(e);
    setSummary(null);
    startSummary(async () => setSummary(await getUserScopeSummary(e)));
  }

  async function switchSeat(targetEmail: string) {
    setError(null);
    setSwitching(targetEmail);
    const res = await signIn('credentials', {
      email: targetEmail,
      redirect: false,
    });
    if (!res || res.error) {
      setError('Could not switch to that seat.');
      setSwitching(null);
      return;
    }
    await update(); // re-pull the client session so the header label updates
    router.refresh(); // re-render the server surface scoped to the new seat
    setSwitching(null);
    setOpen(false);
    setSummary(null);
    setPreviewEmail(null);
  }

  const group =
    groups && groups.length > 0
      ? groups[Math.min(roleIdx, groups.length - 1)]!
      : null;
  const isDelegate = role === 'BUYER_DELEGATE';

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="Switch seat"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:shadow-md cursor-pointer"
      >
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-[11px] text-gray-500">
            {ROLE_LABEL[role] ?? role}
            {analystCode && ` · ${analystCode}`}
            {isDelegate && ' · Delegate'}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[560px] min-w-[560px] p-0"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Switch seat
          </span>
          <span className="text-[11px] text-gray-400">
            currently {name} · {ROLE_LABEL[role] ?? role}
          </span>
        </div>

        {loadingGroups || groups === null ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading seats…
          </div>
        ) : (
          <div className="grid grid-cols-[180px_1fr]">
            {/* Roles */}
            <div className="max-h-[300px] overflow-y-auto border-r border-gray-200 bg-gray-50/60 p-2">
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
                  <span className="flex flex-col leading-tight">
                    <span>{g.label}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        i === roleIdx ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      {g.tier}
                    </span>
                  </span>
                  <span
                    className={`text-xs ${i === roleIdx ? 'text-blue-100' : 'text-gray-400'}`}
                  >
                    {g.users.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Users in the selected role */}
            <div className="max-h-[300px] overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {group?.users.map((u) => {
                  const isCurrent = u.email === email;
                  const isSwitching = switching === u.email;
                  return (
                    <button
                      key={u.email}
                      onMouseEnter={() => preview(u.email)}
                      onFocus={() => preview(u.email)}
                      onClick={() => !isCurrent && switchSeat(u.email)}
                      disabled={!!switching || isCurrent}
                      className={`flex items-center justify-between gap-1 truncate rounded-lg border px-3 py-2 text-left text-sm transition-all disabled:cursor-default ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : previewEmail === u.email
                            ? 'border-gray-400 bg-gray-50 text-gray-800'
                            : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                      title={u.name}
                    >
                      <span className="truncate">{u.name}</span>
                      {isSwitching ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : isCurrent ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Scope preview on the highlighted seat */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : !previewEmail ? (
            <span className="text-gray-400">
              Hover a seat to preview its book; click to switch — the field
              re-shapes in place.
            </span>
          ) : loadingSummary || !summary ? (
            <span className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading their book…
            </span>
          ) : (
            <span className="text-gray-600">
              <strong className="text-gray-900">{summary.name}</strong>
              <span className="ml-2 text-xs uppercase tracking-wider text-blue-600">
                {summary.roleLabel}
              </span>
              {' — '}
              {summary.kind === 'estate' ? 'entire estate · ' : 'book · '}
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
            </span>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-2 text-center text-[11px] text-gray-400">
          Signed in via SSO — no login screen, exactly like production VRS.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
