// Server-side data fetcher + attention computation for the vendor bubble
// field. Metric vocabulary per docs/21-bubble-index-model.md: triage-first,
// not collinear "bigness". Only metrics that are *truthfully computable from
// the real ingest today* are live here; forecast/volume-dependent ones
// (paceToTarget, earningsVsExpected, tierAttainmentGap, grossVolume,
// contractValue, …) ship disabled+labeled — never faked (memory
// project_no_synthetic_data, project_bubble_index_model).

import { prisma, Prisma } from '@vrs/db';
import type { UserRole } from '@vrs/db';

export type BubbleHealth = 'GREEN' | 'AMBER' | 'RED';

// P1.7 — two-tier seat scoping (docs/20). Estate tiers see the whole field;
// operator tiers default to their slice (soft lens, never a cage). Operators
// (individual agents) get NO holistic/aggregate view (decided 2026-05-17).
const ESTATE_ROLES: UserRole[] = ['AP_MANAGER', 'READ_ONLY'] as UserRole[];

export interface ScopeInfo {
  tier: 'estate' | 'operator';
  scopedCount: number;
  totalCount: number;
  showingAll: boolean;
}

// Live, computable-now metrics (docs/21 §3 ✅).
export const METRIC_KEYS = [
  'earningsFY',
  'earningsLTD',
  'openExposure',
  'reviewAging',
  'exceptionLoad',
  'yoyEarningsDelta',
  'activePrograms',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  earningsFY: 'Earnings (this FY)',
  earningsLTD: 'Earnings (lifetime)',
  openExposure: 'Open exposure (unfinalized $)',
  reviewAging: 'Periods behind',
  exceptionLoad: 'Exceptions (post-final adj.)',
  yoyEarningsDelta: 'YoY earnings change',
  activePrograms: 'Active programs',
};

export const METRIC_FORMAT: Record<MetricKey, 'money' | 'count' | 'percent'> = {
  earningsFY: 'money',
  earningsLTD: 'money',
  openExposure: 'money',
  reviewAging: 'count',
  exceptionLoad: 'count',
  yoyEarningsDelta: 'percent',
  activePrograms: 'count',
};

// Designed but not yet computable — surfaced disabled+labeled so intent is
// visible without faking data (docs/21 §7; D1/D2/K8 round-5 ask).
export const METRIC_PENDING: { label: string; awaiting: string }[] = [
  { label: 'Earnings vs expected', awaiting: 'D1' },
  { label: 'Pace to target', awaiting: 'D1' },
  { label: 'Tier attainment gap', awaiting: 'K8' },
  { label: 'Approval queue value', awaiting: 'D1' },
  { label: 'Gross commercial volume', awaiting: 'D2' },
  { label: 'Contract value', awaiting: 'D1' },
  { label: 'Uncaptured opportunity (Vera)', awaiting: 'D1/D2/K8' },
];

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
  const { userId, role, showAll } = viewer;
  const isEstate = ESTATE_ROLES.includes(role);

  type Row = {
    id: string;
    vendorNumber: number;
    name: string;
    earnings_ltd: number;
    earnings_fy: number;
    earnings_prev: number;
    open_exposure: number;
    active_programs: number;
    review_aging: number;
    exception_load: number;
    queue_pending: boolean;
    in_analyst_scope: boolean;
    in_buyer_scope: boolean;
    in_dmm_scope: boolean;
    in_gmm_scope: boolean;
  };

  // yc = real fiscal-year context (years are {0 sentinel, 2024, 2025, 2026};
  // 0 = current/open period). cur = latest real year, prev = the one before.
  // calc = per-vendor earnings/attention aggregates at real scale (~851K
  // calc rows) — server-side, one row per vendor. exc = post-finalization
  // adjustment count. agg = real Agreement scope/queue flags (Agreement is
  // demoted as a *metric* per docs/21 but still drives buyer/DMM/GMM scope).
  const INFLIGHT = "('SUBMITTED_BY_VENDOR','PRE_NEGOTIATION','PENDING_DMM_APPROVAL','PENDING_GMM_APPROVAL','PENDING_AP_APPROVAL','ASSIGNED')";
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH yc AS (
      SELECT
        (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0) AS cur,
        (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0
           AND "fiscalYear" < (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0)) AS prev
    ),
    calc AS (
      SELECT v.id, v."vendorNumber", v.name,
        COALESCE(SUM(c."finalEarnings"), 0)::float8 AS earnings_ltd,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = yc.cur), 0)::float8 AS earnings_fy,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = yc.prev), 0)::float8 AS earnings_prev,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c.status <> 'FINALIZED'), 0)::float8 AS open_exposure,
        COUNT(DISTINCT rp.id) FILTER (WHERE rp.active)::int AS active_programs,
        COUNT(DISTINCT (c."fiscalYear", c."fiscalPeriod"))
          FILTER (WHERE fp."isClosed" AND c.status <> 'FINALIZED')::int AS review_aging,
        COALESCE(bool_or(rp."analystId" = ${userId}), false) AS in_analyst_scope
      FROM "Vendor" v
      JOIN "RebateVendor" rv ON rv."vendorId" = v.id
      JOIN "RebateProgram" rp ON rp.id = rv."rebateProgramId"
      JOIN "RebateVendorDept" d ON d."rebateVendorId" = rv.id
      LEFT JOIN "CalculateResult" c ON c."rebateVendorDeptId" = d.id
      LEFT JOIN "FiscalPeriod" fp
        ON fp."fiscalYear" = c."fiscalYear" AND fp."fiscalPeriod" = c."fiscalPeriod"
      CROSS JOIN yc
      WHERE v.active
      GROUP BY v.id, v."vendorNumber", v.name
    ),
    exc AS (
      SELECT v2.id AS vid, COUNT(adj.id)::int AS exception_load
      FROM "Vendor" v2
      JOIN "RebateVendor" rv2 ON rv2."vendorId" = v2.id
      JOIN "RebateVendorDept" d2 ON d2."rebateVendorId" = rv2.id
      JOIN "CalculateResult" c2 ON c2."rebateVendorDeptId" = d2.id
      JOIN "CalculateResultAdjustment" adj ON adj."calculateResultId" = c2.id
      GROUP BY v2.id
    ),
    agg AS (
      SELECT a."vendorId" vid,
        bool_or(a.status = 'PENDING_AP_APPROVAL') qp,
        bool_or(a."buyerId" = ${userId} OR a."delegateId" = ${userId}) buyer,
        bool_or(a."dmmApprovedBy" = ${userId} OR a.status = 'PENDING_DMM_APPROVAL') dmm,
        bool_or(a."gmmApprovedBy" = ${userId} OR a.status = 'PENDING_GMM_APPROVAL') gmm
      FROM "Agreement" a
      WHERE a.status::text IN ${Prisma.raw(INFLIGHT)} OR a."buyerId" = ${userId}
         OR a."delegateId" = ${userId} OR a."dmmApprovedBy" = ${userId}
         OR a."gmmApprovedBy" = ${userId}
      GROUP BY a."vendorId"
    )
    SELECT calc.*,
      COALESCE(exc.exception_load, 0)::int AS exception_load,
      COALESCE(agg.qp, false) AS queue_pending,
      COALESCE(agg.buyer, false) AS in_buyer_scope,
      COALESCE(agg.dmm, false) AS in_dmm_scope,
      COALESCE(agg.gmm, false) AS in_gmm_scope
    FROM calc
    LEFT JOIN exc ON exc.vid = calc.id
    LEFT JOIN agg ON agg.vid = calc.id
  `);

  const mapped: BubbleVendor[] = rows.map((r) => {
    // Attention-driven health (docs/21): RED = real outstanding work (behind
    // on a closed period); AMBER = something needed correcting post-final;
    // else GREEN. On real finalized data most are correctly GREEN — the
    // signal is the few that aren't, and size/position carry the rest.
    let health: BubbleHealth = 'GREEN';
    if (r.review_aging > 0) health = 'RED';
    else if (r.exception_load > 0) health = 'AMBER';

    const prev = Number(r.earnings_prev);
    const fy = Number(r.earnings_fy);
    const yoy = prev !== 0 ? ((fy - prev) / Math.abs(prev)) * 100 : 0;

    return {
      id: r.id,
      vendorNumber: r.vendorNumber,
      name: r.name,
      health,
      queuePending: r.queue_pending,
      metrics: {
        earningsFY: fy,
        earningsLTD: Number(r.earnings_ltd),
        openExposure: Number(r.open_exposure),
        reviewAging: Number(r.review_aging),
        exceptionLoad: Number(r.exception_load),
        yoyEarningsDelta: yoy,
        activePrograms: Number(r.active_programs),
      },
    };
  });

  const scopeFlag: Record<string, (r: Row) => boolean> = {
    AP_ANALYST: (r) => r.in_analyst_scope,
    BUYER: (r) => r.in_buyer_scope,
    BUYER_DELEGATE: (r) => r.in_buyer_scope,
    DMM: (r) => r.in_dmm_scope,
    GMM: (r) => r.in_gmm_scope,
  };
  const pred = scopeFlag[role];
  const scopedIds = new Set(pred ? rows.filter(pred).map((r) => r.id) : []);
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
