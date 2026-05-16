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
                <TabsContent value="calculations">
                  <CalculationsTab rows={record.calculations} />
                </TabsContent>
                <TabsContent value="agreements">
                  <AgreementsTab rows={record.agreements} />
                </TabsContent>
                <TabsContent value="programs">
                  <ProgramsTab rows={record.programs} />
                </TabsContent>
                <TabsContent value="invoices">
                  <InvoicesTab rows={record.invoices} />
                </TabsContent>
                {TAB_ORDER.filter(
                  (t) =>
                    ![
                      'overview',
                      'calculations',
                      'agreements',
                      'programs',
                      'invoices',
                    ].includes(t.id),
                ).map((t) => (
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

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone =
    s.includes('REJECT') || s.includes('CANCEL') || s.includes('EXPIRE')
      ? 'bg-red-100 text-red-800'
      : s.includes('PENDING') || s === 'OPEN' || s.includes('REVIEW')
        ? 'bg-amber-100 text-amber-800'
        : s.includes('FINAL') || s === 'ASSIGNED' || s === 'APPROVED'
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CalculationsTab({
  rows,
}: {
  rows: VendorRecord['calculations'];
}) {
  if (rows.length === 0)
    return <Empty msg="No calculation rows for this vendor." />;
  return (
    <div>
      <div className="mb-2 text-xs text-gray-500">
        {rows.length === 500
          ? 'Showing 500 most-recent calculation rows'
          : `${rows.length} calculation rows`}{' '}
        · most recent first
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <Th>Program</Th>
              <Th>Dept</Th>
              <Th>Period</Th>
              <Th>Status</Th>
              <Th className="text-right">Earned</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <Td>{r.program}</Td>
                <Td>{r.dept}</Td>
                <Td>
                  FY{r.year}·P{String(r.period).padStart(2, '0')}
                </Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td className="text-right tabular-nums">
                  {formatEarningsShort(r.finalEarnings)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgreementsTab({ rows }: { rows: VendorRecord['agreements'] }) {
  if (rows.length === 0)
    return <Empty msg="No agreements for this vendor." />;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <Th>Agmt&nbsp;#</Th>
            <Th>Description</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th className="text-right">Est. value</Th>
            <Th>Term</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => (
            <tr key={a.agmtId} className="hover:bg-gray-50">
              <Td className="tabular-nums">{a.agmtId}</Td>
              <Td className="max-w-[220px] truncate" title={a.description}>
                {a.description}
              </Td>
              <Td className="whitespace-nowrap text-xs text-gray-600">
                {a.merchType} · {a.source}
              </Td>
              <Td>
                <StatusBadge status={a.status} />
              </Td>
              <Td className="text-right tabular-nums">
                ${fmt(a.estimatedValue)}
              </Td>
              <Td className="whitespace-nowrap text-xs text-gray-500">
                {a.startDate} → {a.endDate}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgramsTab({ rows }: { rows: VendorRecord['programs'] }) {
  if (rows.length === 0)
    return <Empty msg="No rebate programs for this vendor." />;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <Th>Program&nbsp;#</Th>
            <Th>Type</Th>
            <Th>Source</Th>
            <Th>Analyst</Th>
            <Th>Depts</Th>
            <Th>Status</Th>
            <Th className="text-right">Earned</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <Td className="tabular-nums">{p.program}</Td>
              <Td className="text-xs text-gray-600">{p.type}</Td>
              <Td className="text-xs text-gray-600">{p.source}</Td>
              <Td className="text-xs">{p.analyst ?? '—'}</Td>
              <Td className="tabular-nums">{p.depts}</Td>
              <Td>
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    p.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p.active ? 'active' : 'inactive'}
                </span>
              </Td>
              <Td className="text-right tabular-nums">
                {formatEarningsShort(p.earnings)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab({ rows }: { rows: VendorRecord['invoices'] }) {
  if (rows.length === 0)
    return <Empty msg="No invoices for this vendor." />;
  return (
    <div>
      <div className="mb-2 text-xs text-gray-500">
        {rows.length === 300 ? 'Showing 300 most-recent' : `${rows.length}`} ·
        most recent first
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <Th>Invoice</Th>
              <Th>Period</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Due</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((inv) => (
              <tr key={inv.number} className="hover:bg-gray-50">
                <Td className="text-xs">{inv.number}</Td>
                <Td>
                  FY{inv.year}·P{String(inv.period).padStart(2, '0')}
                </Td>
                <Td className="text-xs text-gray-600">{inv.type}</Td>
                <Td>
                  <StatusBadge status={inv.status} />
                </Td>
                <Td className="whitespace-nowrap text-xs text-gray-500">
                  {inv.dueDate}
                </Td>
                <Td className="text-right tabular-nums">${fmt(inv.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  className = '',
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-3 py-2 text-gray-800 ${className}`} title={title}>
      {children}
    </td>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-gray-400">
      {msg}
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
