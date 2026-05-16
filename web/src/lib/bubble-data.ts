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
    contract_value: number;
    active_agreements: number;
    queue_pending: boolean;
    in_analyst_scope: boolean;
    in_buyer_scope: boolean;
    in_dmm_scope: boolean;
    in_gmm_scope: boolean;
  };

  // CTEs: aggregate calc/programs per vendor and agreements per vendor
  // separately (joining Agreement into the 851K-calc join would explode it),
  // then LEFT JOIN per vendor. Agreement is now real (UnapprovedExtract).
  const INFLIGHT = "('SUBMITTED_BY_VENDOR','PRE_NEGOTIATION','PENDING_DMM_APPROVAL','PENDING_GMM_APPROVAL','PENDING_AP_APPROVAL','ASSIGNED')";
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH calc AS (
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
    ),
    agg AS (
      SELECT a."vendorId" vid,
        COALESCE(SUM(a."estimatedValue") FILTER (WHERE a.status::text IN ${Prisma.raw(INFLIGHT)}),0)::float8 cv,
        COUNT(*) FILTER (WHERE a.status::text IN ${Prisma.raw(INFLIGHT)})::int aa,
        bool_or(a.status = 'PENDING_AP_APPROVAL') qp,
        bool_or(a."buyerId" = ${userId} OR a."delegateId" = ${userId}) buyer,
        bool_or(a."dmmApprovedBy" = ${userId} OR a.status = 'PENDING_DMM_APPROVAL') dmm,
        bool_or(a."gmmApprovedBy" = ${userId} OR a.status = 'PENDING_GMM_APPROVAL') gmm
      FROM "Agreement" a GROUP BY a."vendorId"
    )
    SELECT calc.*,
      COALESCE(agg.cv,0)::float8 AS contract_value,
      COALESCE(agg.aa,0)::int AS active_agreements,
      COALESCE(agg.qp,false) AS queue_pending,
      COALESCE(agg.buyer,false) AS in_buyer_scope,
      COALESCE(agg.dmm,false) AS in_dmm_scope,
      COALESCE(agg.gmm,false) AS in_gmm_scope
    FROM calc LEFT JOIN agg ON agg.vid = calc.id
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
      queuePending: r.queue_pending,
      metrics: {
        contractValue: Number(r.contract_value),
        grossVolume: 0, // AnalyticsSummary: 1010-derived, no extract (K11)
        annualEarnings: Number(r.annual_earnings),
        activeAgreements: Number(r.active_agreements),
        activePrograms: Number(r.active_programs),
      },
    };
  });

  // ─── Seat scoping (P1.7) — now real for every operator tier ──────────
  // AP_ANALYST ← RebateProgram.analystId; BUYER/DELEGATE/DMM/GMM ← real
  // Agreement (UnapprovedExtract). grossVolume still 0 (no 1010 extract, K11).
  const scopeFlag: Record<string, (r: Row) => boolean> = {
    AP_ANALYST: (r) => r.in_analyst_scope,
    BUYER: (r) => r.in_buyer_scope,
    BUYER_DELEGATE: (r) => r.in_buyer_scope,
    DMM: (r) => r.in_dmm_scope,
    GMM: (r) => r.in_gmm_scope,
  };
  const pred = scopeFlag[role];
  const scopedIds = new Set(
    pred ? rows.filter(pred).map((r) => r.id) : [],
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
