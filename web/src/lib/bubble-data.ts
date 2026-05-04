// Server-side data fetcher + health computation for the vendor bubble field.
// Health rules per /docs/04-schema-addendum.md §4.
// Returns five metrics per vendor so the work surface can let the user pick
// X / Y / size axes interactively.

import { prisma } from '@vrs/db';

export type BubbleHealth = 'GREEN' | 'AMBER' | 'RED';

export const METRIC_KEYS = [
  'contractValue',
  'grossVolume',
  'annualEarnings',
  'activeAgreements',
  'activePrograms',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  contractValue: 'Contract value',
  grossVolume: 'Gross commercial volume',
  annualEarnings: 'Annual rebate earnings',
  activeAgreements: 'Active agreements',
  activePrograms: 'Active programs',
};

// "Currency" for axis-label display. Counts use bare numbers, $ for the rest.
export const METRIC_FORMAT: Record<MetricKey, 'money' | 'count'> = {
  contractValue: 'money',
  grossVolume: 'money',
  annualEarnings: 'money',
  activeAgreements: 'count',
  activePrograms: 'count',
};

export interface BubbleVendor {
  id: string;
  vendorNumber: number;
  name: string;
  health: BubbleHealth;
  queuePending: boolean;
  metrics: Record<MetricKey, number>;
}

const NON_TERMINAL_AGREEMENT_STATUSES = [
  'SUBMITTED_BY_VENDOR',
  'PRE_NEGOTIATION',
  'PENDING_DMM_APPROVAL',
  'PENDING_GMM_APPROVAL',
  'PENDING_AP_APPROVAL',
  'ASSIGNED',
] as const;

export async function getBubbleData(): Promise<BubbleVendor[]> {
  const lastClosed = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: true },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalPeriod: 'desc' }],
  });
  const currentOpen = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: false },
    orderBy: [{ fiscalYear: 'asc' }, { fiscalPeriod: 'asc' }],
  });

  const vendors = await prisma.vendor.findMany({
    where: { active: true },
    include: {
      agreements: {
        select: { id: true, status: true, estimatedValue: true },
      },
      rebateVendors: {
        include: {
          rebateProgram: { select: { active: true } },
          invoices: { where: { status: { not: 'PAID' } } },
          rebateVendorDepts: {
            include: { calculateResults: true },
          },
        },
      },
      analyticsSummaries: {
        select: { anomalyFlag: true, tierAlert: true, transactionVolume: true },
      },
    },
  });

  const now = Date.now();
  const dayMs = 86_400_000;

  return vendors.map((v) => {
    const allCalcs = v.rebateVendors.flatMap((rv) =>
      rv.rebateVendorDepts.flatMap((rvd) => rvd.calculateResults),
    );
    const allInvoices = v.rebateVendors.flatMap((rv) => rv.invoices);

    const closedCalcs = lastClosed
      ? allCalcs.filter(
          (c) =>
            c.fiscalPeriod === lastClosed.fiscalPeriod &&
            c.fiscalYear === lastClosed.fiscalYear,
        )
      : [];
    const openCalcs = currentOpen
      ? allCalcs.filter(
          (c) =>
            c.fiscalPeriod === currentOpen.fiscalPeriod &&
            c.fiscalYear === currentOpen.fiscalYear,
        )
      : [];

    // ─── Health rules ────────────────────────────────────────────
    const hasOpenInClosed = closedCalcs.some((c) => c.status === 'OPEN');
    const hasAnomaly = v.analyticsSummaries.some((s) => s.anomalyFlag);
    const hasOverdue60 = allInvoices.some(
      (inv) => (now - inv.dueDate.getTime()) / dayMs > 60,
    );
    const queuePending = v.agreements.some((a) => a.status === 'PENDING_AP_APPROVAL');

    let health: BubbleHealth = 'GREEN';
    if (hasOpenInClosed || hasAnomaly || hasOverdue60) {
      health = 'RED';
    } else {
      const hasUnfinalizedClosed = closedCalcs.some((c) => c.status !== 'FINALIZED');
      const hasActionableOpen = openCalcs.some(
        (c) => c.status === 'PENDING_REVIEW' || c.status === 'REVIEWED',
      );
      const hasTierAlert = v.analyticsSummaries.some((s) => s.tierAlert);
      const hasOverdue30 = allInvoices.some(
        (inv) => (now - inv.dueDate.getTime()) / dayMs > 30,
      );
      if (
        hasUnfinalizedClosed ||
        hasActionableOpen ||
        hasTierAlert ||
        queuePending ||
        hasOverdue30
      ) {
        health = 'AMBER';
      }
    }

    // ─── Metrics ─────────────────────────────────────────────────
    const annualEarnings = allCalcs.reduce(
      (sum, c) => sum + Number(c.finalEarnings),
      0,
    );
    const contractValue = v.agreements
      .filter((a) =>
        (NON_TERMINAL_AGREEMENT_STATUSES as readonly string[]).includes(a.status),
      )
      .reduce((sum, a) => sum + Number(a.estimatedValue), 0);
    const grossVolume = v.analyticsSummaries.reduce(
      (sum, s) => sum + Number(s.transactionVolume),
      0,
    );
    const activeAgreements = v.agreements.filter((a) =>
      (NON_TERMINAL_AGREEMENT_STATUSES as readonly string[]).includes(a.status),
    ).length;
    const activePrograms = v.rebateVendors.filter(
      (rv) => rv.rebateProgram.active,
    ).length;

    return {
      id: v.id,
      vendorNumber: v.vendorNumber,
      name: v.name,
      health,
      queuePending,
      metrics: {
        contractValue,
        grossVolume,
        annualEarnings,
        activeAgreements,
        activePrograms,
      },
    };
  });
}
