'use client';

// P1.1 — Right slider: the vendor record. Opens on bubble click (P1.2).
// Overlays the bubble-field page via client state (no route nav). Default tab
// is role-driven (permissions.defaultVendorRecordTab). Earnings rendered through
// the glossary contract (Decision ①): labeled "$X earned" / "$Y owed", with an
// Accounting view showing the legacy sign.
//
// Overview tab is real now; the other six are honest "next P1 step" panels —
// the tab structure is real, the bodies arrive in later P1 increments.

import { useEffect, useState } from 'react';
import type { UserRole } from '@vrs/db';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { defaultVendorRecordTab, type VendorRecordTab } from '@/lib/permissions';
import {
  formatEarnings,
  formatEarningsShort,
  formatAccounting,
  ACCOUNTING_VIEW_NOTE,
} from '@/lib/glossary';
import { getVendorRecord, type VendorRecord } from '@/lib/vendor-record';

const TAB_ORDER: { id: VendorRecordTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'intelligence', label: '1010 Intelligence' },
  { id: 'programs', label: 'Programs' },
  { id: 'calculations', label: 'Calculations' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
];

export function VendorRecordSlider({
  vendorId,
  role,
  onClose,
}: {
  vendorId: string | null;
  role: UserRole;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<VendorRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<VendorRecordTab>('overview');

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    setLoading(true);
    setRecord(null);
    setTab(defaultVendorRecordTab(role)); // role-driven default
    getVendorRecord(vendorId)
      .then((r) => {
        if (!cancelled) setRecord(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, role]);

  return (
    <Sheet
      open={vendorId !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="!max-w-none w-full sm:w-[56vw] sm:!max-w-[860px] p-0 gap-0"
      >
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading vendor record…
          </div>
        )}

        {!loading && record && (
          <>
            <SheetHeader className="border-b border-gray-200 px-6 py-4">
              <SheetTitle className="text-xl font-bold text-gray-900">
                {record.vendor.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-gray-500">
                AP&nbsp;#{record.vendor.apNumber ?? record.vendor.vendorNumber}
                {record.vendor.ipNumber != null && (
                  <> · IP&nbsp;#{record.vendor.ipNumber}</>
                )}
                {!record.vendor.active && (
                  <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-gray-700">
                    inactive
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as VendorRecordTab)}
              className="flex-1 overflow-hidden"
            >
              <TabsList
                variant="line"
                className="flex-wrap gap-1 border-b border-gray-200 px-4 pt-2 pb-0 h-auto"
              >
                {TAB_ORDER.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                    {t.id === 'programs' && countBadge(record.counts.programs)}
                    {t.id === 'calculations' &&
                      countBadge(record.counts.calculations)}
                    {t.id === 'agreements' &&
                      countBadge(record.counts.agreements)}
                    {t.id === 'invoices' && countBadge(record.counts.invoices)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="overflow-y-auto px-6 py-5 h-[calc(100vh-9.5rem)]">
                <TabsContent value="overview">
                  <OverviewTab record={record} />
                </TabsContent>
                {TAB_ORDER.filter((t) => t.id !== 'overview').map((t) => (
                  <TabsContent key={t.id} value={t.id}>
                    <Placeholder label={t.label} />
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </>
        )}

        {!loading && !record && vendorId && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Vendor record unavailable.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function countBadge(n: number) {
  return (
    <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-[11px] font-medium text-gray-600">
      {n}
    </span>
  );
}

function OverviewTab({ record }: { record: VendorRecord }) {
  const { overview } = record;
  const [accounting, setAccounting] = useState(false);
  const c = overview.components;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi
          label="Rebate earnings"
          value={
            accounting
              ? formatAccounting(overview.annualEarningsLegacy)
              : formatEarnings(overview.annualEarnings)
          }
        />
        <Kpi label="Commercial volume" value={`$${fmt(overview.grossVolume)}`} />
        <Kpi label="Contract value" value={`$${fmt(overview.contractValue)}`} />
        <Kpi label="Programs" value={String(record.counts.programs)} />
        <Kpi label="Agreements" value={String(record.counts.agreements)} />
        <Kpi label="Open invoices" value={String(overview.openInvoices)} />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Earnings components
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
          <Component label="PMU" value={c.pmu} />
          <Component label="Margin" value={c.margin} />
          <Component label="Adv Coop" value={c.advcoop} />
          <Component label="Other Coop" value={c.otherCoop} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={accounting}
          onChange={(e) => setAccounting(e.target.checked)}
          className="rounded border-gray-300"
        />
        Accounting view
      </label>
      {accounting && (
        <p className="text-xs text-gray-500">{ACCOUNTING_VIEW_NOTE}</p>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

function Component({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 font-semibold text-gray-900">
        {formatEarningsShort(value)}
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="text-xs text-gray-400">
        Built in a later Phase&nbsp;1 increment — tab structure is live, body
        pending.
      </div>
    </div>
  );
}

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
