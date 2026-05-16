// Server-side data fetcher + health computation for the vendor bubble field.
// Health rules per /docs/04-schema-addendum.md §4.
// Returns five metrics per vendor so the work surface can let the user pick
// X / Y / size axes interactively.

import { prisma } from '@vrs/db';
import type { UserRole } from '@vrs/db';

export type BubbleHealth = 'GREEN' | 'AMBER' | 'RED';

// P1.7 — two-tier seat scoping (docs/20). Estate tiers see the whole field by
// default; operator tiers default to their slice but can "show all" (soft lens,
// never a cage). Note: real VRS security is form-level, not row-level — this
// per-seat *data* lens is a deliberate design improvement, not legacy fidelity.
// VRS_ADMIN/VRS_MANAGER/FPA_SUPERVISOR aren't in the prototype UserRole enum;
// AP_MANAGER stands in for the estate-admin tier here.
const ESTATE_ROLES: UserRole[] = ['AP_MANAGER', 'READ_ONLY'] as UserRole[];

export interface ScopeInfo {
  tier: 'estate' | 'operator';
  scopedCount: number; // size of this seat's own slice
  totalCount: number; // all active vendors
  showingAll: boolean; // operator viewing the full estate via override
}

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

export interface BubbleDataResult {
  bubbles: BubbleVendor[];
  scope: ScopeInfo;
}

export async function getBubbleData(viewer: {
  userId: string;
  role: UserRole;
  showAll?: boolean;
}): Promise<BubbleDataResult> {
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
        select: {
          id: true,
          status: true,
          estimatedValue: true,
          buyerId: true,
          delegateId: true,
          dmmApprovedBy: true,
          gmmApprovedBy: true,
        },
      },
      rebateVendors: {
        include: {
          rebateProgram: { select: { active: true, analystId: true } },
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

  const mapped: BubbleVendor[] = vendors.map((v) => {
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

  // ─── Seat scoping (P1.7) ─────────────────────────────────────────────
  const { userId, role, showAll } = viewer;
  const isEstate = ESTATE_ROLES.includes(role);

  const inScope = (
    v: (typeof vendors)[number],
  ): boolean => {
    switch (role) {
      case 'AP_ANALYST':
        return v.rebateVendors.some(
          (rv) => rv.rebateProgram.analystId === userId,
        );
      case 'BUYER':
        return v.agreements.some((a) => a.buyerId === userId);
      case 'BUYER_DELEGATE':
        return v.agreements.some(
          (a) => a.delegateId === userId || a.buyerId === userId,
        );
      case 'DMM':
        return v.agreements.some(
          (a) => a.dmmApprovedBy === userId || a.status === 'PENDING_DMM_APPROVAL',
        );
      case 'GMM':
        return v.agreements.some(
          (a) => a.gmmApprovedBy === userId || a.status === 'PENDING_GMM_APPROVAL',
        );
      default:
        return true;
    }
  };

  const scopedIds = new Set(
    vendors.filter((v) => inScope(v)).map((v) => v.id),
  );
  const totalCount = mapped.length;
  const scopedCount = isEstate ? totalCount : scopedIds.size;
  const showingAll = isEstate || !!showAll;

  const bubbles = showingAll
    ? mapped
    : mapped.filter((b) => scopedIds.has(b.id));

  return {
    bubbles,
    scope: {
      tier: isEstate ? 'estate' : 'operator',
      scopedCount,
      totalCount,
      showingAll,
    },
  };
}
