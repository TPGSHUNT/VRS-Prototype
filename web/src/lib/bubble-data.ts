// Server-side data fetcher + health computation for the vendor bubble field.
// Health rules per /docs/04-schema-addendum.md §4.
// Returns five metrics per vendor so the work surface can let the user pick
// X / Y / size axes interactively.

import { prisma, Prisma } from '@vrs/db';
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

export interface BubbleDataResult {
  bubbles: BubbleVendor[];
  scope: ScopeInfo;
}

export async function getBubbleData(viewer: {
  userId: string;
  role: UserRole;
  showAll?: boolean;
}): Promise<BubbleDataResult> {
  // REAL SCALE (Phase 3.1): ~2,573 vendors / ~851K calc rows. The old
  // findMany-include-all-then-reduce-in-JS approach OOMs here. Aggregate
  // server-side: one grouped query → one row per vendor.
  const lastClosed = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: true },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalPeriod: 'desc' }],
  });
  const currentOpen = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: false },
    orderBy: [{ fiscalYear: 'asc' }, { fiscalPeriod: 'asc' }],
  });
  const cY = lastClosed?.fiscalYear ?? -1;
  const cP = lastClosed?.fiscalPeriod ?? -1;
  const oY = currentOpen?.fiscalYear ?? -1;
  const oP = currentOpen?.fiscalPeriod ?? -1;
  const { userId, role, showAll } = viewer;
  const isEstate = ESTATE_ROLES.includes(role);

  type Row = {
    id: string;
    vendorNumber: number;
    name: string;
    annual_earnings: number;
    active_programs: number;
    open_in_closed: boolean;
    unfinalized_closed: boolean;
    actionable_open: boolean;
    in_analyst_scope: boolean;
  };

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT v.id, v."vendorNumber", v.name,
      COALESCE(SUM(c."finalEarnings"), 0)::float8 AS annual_earnings,
      COUNT(DISTINCT rp.id) FILTER (WHERE rp.active)::int AS active_programs,
      COALESCE(bool_or(c.status = 'OPEN' AND c."fiscalYear" = ${cY} AND c."fiscalPeriod" = ${cP}), false) AS open_in_closed,
      COALESCE(bool_or(c.status <> 'FINALIZED' AND c."fiscalYear" = ${cY} AND c."fiscalPeriod" = ${cP}), false) AS unfinalized_closed,
      COALESCE(bool_or(c.status IN ('PENDING_REVIEW','REVIEWED') AND c."fiscalYear" = ${oY} AND c."fiscalPeriod" = ${oP}), false) AS actionable_open,
      COALESCE(bool_or(rp."analystId" = ${userId}), false) AS in_analyst_scope
    FROM "Vendor" v
    JOIN "RebateVendor" rv ON rv."vendorId" = v.id
    JOIN "RebateProgram" rp ON rp.id = rv."rebateProgramId"
    JOIN "RebateVendorDept" d ON d."rebateVendorId" = rv.id
    LEFT JOIN "CalculateResult" c ON c."rebateVendorDeptId" = d.id
    WHERE v.active
    GROUP BY v.id, v."vendorNumber", v.name
  `);

  const mapped: BubbleVendor[] = rows.map((r) => {
    let health: BubbleHealth = 'GREEN';
    if (r.open_in_closed) health = 'RED';
    else if (r.unfinalized_closed || r.actionable_open) health = 'AMBER';
    return {
      id: r.id,
      vendorNumber: r.vendorNumber,
      name: r.name,
      health,
      queuePending: false, // Agreement table empty post real-ingest (no extract)
      metrics: {
        contractValue: 0, // Agreement: no real extract
        grossVolume: 0, // AnalyticsSummary: 1010-derived, no extract
        annualEarnings: Number(r.annual_earnings),
        activeAgreements: 0, // Agreement: no real extract
        activePrograms: Number(r.active_programs),
      },
    };
  });

  // ─── Seat scoping (P1.7) ─────────────────────────────────────────────
  // AP_ANALYST scopes by real RebateProgram.analystId. BUYER/DMM/GMM scope
  // via Agreement, which has no real extract yet → empty until that lands
  // (honest, not fabricated; see docs/19 K9-extension). Estate → all.
  const scopedIds = new Set(
    role === 'AP_ANALYST'
      ? rows.filter((r) => r.in_analyst_scope).map((r) => r.id)
      : [],
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
