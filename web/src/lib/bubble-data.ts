// Server-side fetcher for the bubble field — the "now"-anchored encoding
// (docs/21 §9, spec of record).
//
// Three semantic dimensions, NO X/Y/Size pickers:
//   • Materiality  → vertical position + bubble size (reinforced)
//   • Performance  → horizontal position
//   • Attention    → colour
//
// This module returns, per vendor: raw component values + their
// rank-percentiles across the active set, a same-period YoY performance
// value (+ percentile), and the attention verdict. The *composite*
// materiality is assembled CLIENT-side from the percentiles so the settings
// bar can re-weight live without a refetch (docs/21 §9.3/§9.6).
//
// Same-period rule (docs/21 §9.1): all YoY is FY-YTD vs prior-FY *same
// elapsed periods* — never full-vs-partial (FY2026 = P1–2 only), never the
// stale last-two-complete-years. Nothing synthetic; Cat 2 (commercial
// size = volume/contract, D1/D2) is absent and renormalized, never faked.

import { prisma, Prisma } from '@vrs/db';
import type { UserRole } from '@vrs/db';

export type BubbleHealth = 'GREEN' | 'AMBER' | 'RED';

const ESTATE_ROLES: UserRole[] = ['AP_MANAGER', 'READ_ONLY'] as UserRole[];

// ─── Materiality components & categories (docs/21 §9.3) ──────────────────
export const COMPONENT_KEYS = [
  'earningsTTM',
  'earningsFullFY',
  'earningsLTD',
  'earningsOpen',
  'activePrograms',
  'activeAgreements',
  'deptCoverage',
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export type CategoryKey = 'cat1' | 'cat2' | 'cat3';

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  cat1: 'Earnings',
  cat2: 'Commercial size',
  cat3: 'Breadth',
};
// Cat 2 has no computable component today (volume/contract = D1/D2). It is
// declared, listed, and inert — its weight renormalizes (docs/21 §9.3).
export const CATEGORY_AVAILABLE: Record<CategoryKey, boolean> = {
  cat1: true,
  cat2: false,
  cat3: true,
};
export const CATEGORY_OF: Record<ComponentKey, CategoryKey> = {
  earningsTTM: 'cat1',
  earningsFullFY: 'cat1',
  earningsLTD: 'cat1',
  earningsOpen: 'cat1',
  activePrograms: 'cat3',
  activeAgreements: 'cat3',
  deptCoverage: 'cat3',
};
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  earningsTTM: 'Earnings · trailing 12 mo',
  earningsFullFY: 'Earnings · latest full FY',
  earningsLTD: 'Earnings · lifetime',
  earningsOpen: 'Earnings · open period',
  activePrograms: 'Active programs',
  activeAgreements: 'Active agreements',
  deptCoverage: 'Dept / category coverage',
};
export const COMPONENT_FORMAT: Record<ComponentKey, 'money' | 'count'> = {
  earningsTTM: 'money',
  earningsFullFY: 'money',
  earningsLTD: 'money',
  earningsOpen: 'money',
  activePrograms: 'count',
  activeAgreements: 'count',
  deptCoverage: 'count',
};
// Conceptually-correct but data-blocked (docs/21 §9.3 Cat 2) — surfaced
// disabled+labeled by the settings bar, never faked.
export const PENDING_COMPONENTS: { label: string; awaiting: string }[] = [
  { label: 'Gross commercial / purchase volume', awaiting: 'D2' },
  { label: 'Volume-to-date (current FY)', awaiting: 'D2' },
  { label: 'Contract / expected value', awaiting: 'D1' },
];

export interface ScopeInfo {
  tier: 'estate' | 'operator';
  scopedCount: number;
  totalCount: number;
  showingAll: boolean;
}

export interface BubbleVendor {
  id: string;
  vendorNumber: number;
  name: string;
  queuePending: boolean;
  components: Record<ComponentKey, number>; // raw
  pctl: Record<ComponentKey, number>; // 0..1 across the active set
  performance: number; // same-period YoY delta (signed fraction)
  performancePctl: number; // 0..1 (X position; 0.5 ≈ flat)
  ytdCur: number; // raw same-period YTD (for correct cluster aggregation)
  ytdPrev: number;
  attention: { level: BubbleHealth; reasons: string[]; stake: number };
  // Cluster dimensions for the estate drill-down (docs/21 §8.2).
  analystId: string | null;
  analystName: string;
  programTypeId: string | null;
  programTypeName: string;
}

export interface BubbleDataResult {
  bubbles: BubbleVendor[];
  scope: ScopeInfo;
  meta: { curY: number; prevY: number; curMaxP: number; fullFY: number | null };
}

// Attention thresholds (docs/21 §9.5 — tunable).
const MATERIAL_PRIOR = 10_000; // prior-YTD $ considered material
const CLIFF_FRAC = 0.05; // current ≤ 5% of prior (and ≤ $1k) = cliff
const CLIFF_ABS = 1_000;
const COLLAPSE_PCT = 0.5; // ≥ 50% YTD decline (not cliff) = collapse

function money(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
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
    e_ttm: number;
    e_fullfy: number;
    e_ltd: number;
    e_open: number;
    ytd_cur: number;
    ytd_prev: number;
    active_programs: number;
    dept_coverage: number;
    review_aging: number;
    open_unfinalized: number;
    cur_y: number;
    prev_y: number;
    cur_maxp: number;
    full_fy: number | null;
    exception_load: number;
    active_agreements: number;
    queue_pending: boolean;
    in_analyst_scope: boolean;
    in_buyer_scope: boolean;
    in_dmm_scope: boolean;
    in_gmm_scope: boolean;
    analyst_id: string | null;
    analyst_name: string;
    program_type_id: string | null;
    program_type_name: string;
  };

  const INFLIGHT =
    "('SUBMITTED_BY_VENDOR','PRE_NEGOTIATION','PENDING_DMM_APPROVAL','PENDING_GMM_APPROVAL','PENDING_AP_APPROVAL','ASSIGNED')";

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH yc AS (
      SELECT
        (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0) AS cur,
        (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0
           AND "fiscalYear" < (SELECT max("fiscalYear") FROM "CalculateResult" WHERE "fiscalYear" > 0)) AS prev
    ),
    cm AS (
      SELECT max("fiscalPeriod") AS cur_maxp
      FROM "CalculateResult" WHERE "fiscalYear" = (SELECT cur FROM yc)
    ),
    fy AS (
      SELECT max("fiscalYear") AS full_fy FROM (
        SELECT "fiscalYear" FROM "CalculateResult" WHERE "fiscalYear" > 0
        GROUP BY "fiscalYear" HAVING count(DISTINCT "fiscalPeriod") = 12
      ) q
    ),
    recent AS (
      SELECT "fiscalYear" y, "fiscalPeriod" p
      FROM "CalculateResult" WHERE "fiscalYear" > 0
      GROUP BY "fiscalYear", "fiscalPeriod"
      ORDER BY "fiscalYear" DESC, "fiscalPeriod" DESC LIMIT 12
    ),
    -- Earnings sums over the big RVD→Calc fan-out (cheap: SUM only, no
    -- DISTINCT, only a 12-row recent hash-join). Keyed by vendor.
    earn AS (
      SELECT rv."vendorId" vid,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE rc.y IS NOT NULL), 0)::float8 AS e_ttm,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = (SELECT full_fy FROM fy)), 0)::float8 AS e_fullfy,
        COALESCE(SUM(c."finalEarnings"), 0)::float8 AS e_ltd,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = 0), 0)::float8 AS e_open,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = (SELECT cur FROM yc)), 0)::float8 AS ytd_cur,
        COALESCE(SUM(c."finalEarnings") FILTER (
          WHERE c."fiscalYear" = (SELECT prev FROM yc) AND c."fiscalPeriod" <= (SELECT cur_maxp FROM cm)), 0)::float8 AS ytd_prev,
        COALESCE(SUM(c."finalEarnings") FILTER (WHERE c."fiscalYear" = 0 AND c.status <> 'FINALIZED'), 0)::float8 AS open_unfinalized
      FROM "RebateVendor" rv
      JOIN "RebateVendorDept" d ON d."rebateVendorId" = rv.id
      JOIN "CalculateResult" c ON c."rebateVendorDeptId" = d.id
      LEFT JOIN recent rc ON rc.y = c."fiscalYear" AND rc.p = c."fiscalPeriod"
      GROUP BY rv."vendorId"
    ),
    -- Program count + analyst scope: structural only, no calc fan-out.
    prog AS (
      SELECT rv."vendorId" vid,
        COUNT(DISTINCT rp.id) FILTER (WHERE rp.active)::int AS active_programs,
        COALESCE(bool_or(rp."analystId" = ${userId}), false) AS in_analyst_scope
      FROM "RebateVendor" rv
      JOIN "RebateProgram" rp ON rp.id = rv."rebateProgramId"
      GROUP BY rv."vendorId"
    ),
    -- Dept/category coverage: structural only, no calc fan-out.
    dept AS (
      SELECT rv."vendorId" vid, COUNT(DISTINCT d.id)::int AS dept_coverage
      FROM "RebateVendor" rv
      JOIN "RebateVendorDept" d ON d."rebateVendorId" = rv.id
      GROUP BY rv."vendorId"
    ),
    -- Periods-behind: pre-filter to non-FINALIZED in the join, so on real
    -- data (closed periods 100% finalized) this scans almost nothing.
    aging AS (
      SELECT rv."vendorId" vid,
        COUNT(DISTINCT (c."fiscalYear", c."fiscalPeriod"))::int AS review_aging
      FROM "RebateVendor" rv
      JOIN "RebateVendorDept" d ON d."rebateVendorId" = rv.id
      JOIN "CalculateResult" c
        ON c."rebateVendorDeptId" = d.id AND c.status <> 'FINALIZED'
      JOIN "FiscalPeriod" fp
        ON fp."fiscalYear" = c."fiscalYear"
        AND fp."fiscalPeriod" = c."fiscalPeriod" AND fp."isClosed"
      GROUP BY rv."vendorId"
    ),
    exc AS (
      SELECT rv2."vendorId" AS vid, COUNT(adj.id)::int AS exception_load
      FROM "RebateVendor" rv2
      JOIN "RebateVendorDept" d2 ON d2."rebateVendorId" = rv2.id
      JOIN "CalculateResult" c2 ON c2."rebateVendorDeptId" = d2.id
      JOIN "CalculateResultAdjustment" adj ON adj."calculateResultId" = c2.id
      GROUP BY rv2."vendorId"
    ),
    agg AS (
      SELECT a."vendorId" vid,
        COUNT(*) FILTER (WHERE a.status::text IN ${Prisma.raw(INFLIGHT)})::int aa,
        bool_or(a.status = 'PENDING_AP_APPROVAL') qp,
        bool_or(a."buyerId" = ${userId} OR a."delegateId" = ${userId}) buyer,
        bool_or(a."dmmApprovedBy" = ${userId} OR a.status = 'PENDING_DMM_APPROVAL') dmm,
        bool_or(a."gmmApprovedBy" = ${userId} OR a.status = 'PENDING_GMM_APPROVAL') gmm
      FROM "Agreement" a GROUP BY a."vendorId"
    ),
    -- Dominant analyst / program-type per vendor (the modal owner) — the
    -- cluster dimensions for the estate drill-down (docs/21 §8.2).
    doma AS (
      SELECT vid, aid, aname FROM (
        SELECT rv."vendorId" vid, rp."analystId" aid, u.name aname,
          row_number() OVER (PARTITION BY rv."vendorId" ORDER BY count(*) DESC) rn
        FROM "RebateVendor" rv
        JOIN "RebateProgram" rp ON rp.id = rv."rebateProgramId"
        JOIN "User" u ON u.id = rp."analystId"
        GROUP BY rv."vendorId", rp."analystId", u.name
      ) z WHERE rn = 1
    ),
    dompt AS (
      SELECT vid, ptid, ptn FROM (
        SELECT rv."vendorId" vid, pt.id ptid, pt.name ptn,
          row_number() OVER (PARTITION BY rv."vendorId" ORDER BY count(*) DESC) rn
        FROM "RebateVendor" rv
        JOIN "RebateProgram" rp ON rp.id = rv."rebateProgramId"
        JOIN "ProgramType" pt ON pt.id = rp."programTypeId"
        GROUP BY rv."vendorId", pt.id, pt.name
      ) z WHERE rn = 1
    )
    SELECT v.id, v."vendorNumber", v.name,
      COALESCE(earn.e_ttm, 0)::float8 AS e_ttm,
      COALESCE(earn.e_fullfy, 0)::float8 AS e_fullfy,
      COALESCE(earn.e_ltd, 0)::float8 AS e_ltd,
      COALESCE(earn.e_open, 0)::float8 AS e_open,
      COALESCE(earn.ytd_cur, 0)::float8 AS ytd_cur,
      COALESCE(earn.ytd_prev, 0)::float8 AS ytd_prev,
      COALESCE(earn.open_unfinalized, 0)::float8 AS open_unfinalized,
      doma.aid AS analyst_id,
      COALESCE(doma.aname, '—') AS analyst_name,
      dompt.ptid AS program_type_id,
      COALESCE(dompt.ptn, '—') AS program_type_name,
      COALESCE(prog.active_programs, 0)::int AS active_programs,
      COALESCE(prog.in_analyst_scope, false) AS in_analyst_scope,
      COALESCE(dept.dept_coverage, 0)::int AS dept_coverage,
      COALESCE(aging.review_aging, 0)::int AS review_aging,
      (SELECT cur FROM yc) AS cur_y,
      (SELECT prev FROM yc) AS prev_y,
      (SELECT cur_maxp FROM cm) AS cur_maxp,
      (SELECT full_fy FROM fy) AS full_fy,
      COALESCE(exc.exception_load, 0)::int AS exception_load,
      COALESCE(agg.aa, 0)::int AS active_agreements,
      COALESCE(agg.qp, false) AS queue_pending,
      COALESCE(agg.buyer, false) AS in_buyer_scope,
      COALESCE(agg.dmm, false) AS in_dmm_scope,
      COALESCE(agg.gmm, false) AS in_gmm_scope
    FROM "Vendor" v
    LEFT JOIN earn ON earn.vid = v.id
    LEFT JOIN prog ON prog.vid = v.id
    LEFT JOIN dept ON dept.vid = v.id
    LEFT JOIN aging ON aging.vid = v.id
    LEFT JOIN exc ON exc.vid = v.id
    LEFT JOIN agg ON agg.vid = v.id
    LEFT JOIN doma ON doma.vid = v.id
    LEFT JOIN dompt ON dompt.vid = v.id
    WHERE v.active
  `);

  const curY = Number(rows[0]?.cur_y ?? 0);
  const prevY = Number(rows[0]?.prev_y ?? 0);
  const curMaxP = Number(rows[0]?.cur_maxp ?? 0);
  const fullFY = rows[0]?.full_fy != null ? Number(rows[0]!.full_fy) : null;

  // Raw components + same-period performance.
  type Mid = {
    row: Row;
    components: Record<ComponentKey, number>;
    performance: number;
    attention: { level: BubbleHealth; reasons: string[]; stake: number };
  };
  const mid: Mid[] = rows.map((r) => {
    const components: Record<ComponentKey, number> = {
      earningsTTM: Number(r.e_ttm),
      earningsFullFY: Number(r.e_fullfy),
      earningsLTD: Number(r.e_ltd),
      earningsOpen: Number(r.e_open),
      activePrograms: Number(r.active_programs),
      activeAgreements: Number(r.active_agreements),
      deptCoverage: Number(r.dept_coverage),
    };
    const cur = Number(r.ytd_cur);
    const prev = Number(r.ytd_prev);
    const performance =
      prev !== 0 ? (cur - prev) / Math.abs(prev) : cur > 0 ? 1 : 0;

    // Attention (docs/21 §9.5): same-period cliff/collapse + operational.
    const reasons: string[] = [];
    let level: BubbleHealth = 'GREEN';
    let stake = 0;
    const cliff =
      prev >= MATERIAL_PRIOR &&
      cur <= Math.max(CLIFF_ABS, prev * CLIFF_FRAC);
    const collapse =
      !cliff &&
      prev >= MATERIAL_PRIOR &&
      cur < prev &&
      (prev - cur) / prev >= COLLAPSE_PCT;
    if (cliff) {
      level = 'RED';
      stake += prev;
      reasons.push(
        `Earnings cliff: ${money(prev)} (FY${prevY} YTD) → ~$0 (FY${curY} YTD)`,
      );
    } else if (collapse) {
      level = 'AMBER';
      stake += prev - cur;
      reasons.push(
        `YoY collapse −${Math.round(((prev - cur) / prev) * 100)}%: ${money(prev)} → ${money(cur)} (YTD)`,
      );
    }
    if (Number(r.review_aging) > 0) {
      level = 'RED';
      reasons.push(`Behind ${r.review_aging} closed period(s)`);
    }
    if (Number(r.open_unfinalized) > 0 && level !== 'RED') {
      level = level === 'GREEN' ? 'AMBER' : level;
      reasons.push(`${money(Number(r.open_unfinalized))} unfinalized in the open period`);
    }
    if (Number(r.exception_load) > 0) {
      if (level === 'GREEN') level = 'AMBER';
      reasons.push(`${r.exception_load} post-final adjustment(s)`);
    }
    return { row: r, components, performance, attention: { level, reasons, stake } };
  });

  // Rank-percentiles across the active set (docs/21 §9.3 — unit-free,
  // outlier/missing-robust). Computed over ALL active vendors so percentiles
  // are estate-relative regardless of seat scope.
  const n = mid.length || 1;
  const pctlByComp = {} as Record<ComponentKey, Map<string, number>>;
  for (const k of COMPONENT_KEYS) {
    const sorted = [...mid].sort(
      (a, b) => a.components[k] - b.components[k],
    );
    const m = new Map<string, number>();
    sorted.forEach((x, i) => m.set(x.row.id, (i + 0.5) / n));
    pctlByComp[k] = m;
  }
  const perfSorted = [...mid].sort((a, b) => a.performance - b.performance);
  const perfPctl = new Map<string, number>();
  perfSorted.forEach((x, i) => perfPctl.set(x.row.id, (i + 0.5) / n));

  const all: BubbleVendor[] = mid.map((x) => {
    const pctl = {} as Record<ComponentKey, number>;
    for (const k of COMPONENT_KEYS) pctl[k] = pctlByComp[k].get(x.row.id) ?? 0.5;
    return {
      id: x.row.id,
      vendorNumber: x.row.vendorNumber,
      name: x.row.name,
      queuePending: x.row.queue_pending,
      components: x.components,
      pctl,
      performance: x.performance,
      performancePctl: perfPctl.get(x.row.id) ?? 0.5,
      ytdCur: Number(x.row.ytd_cur),
      ytdPrev: Number(x.row.ytd_prev),
      attention: x.attention,
      analystId: x.row.analyst_id,
      analystName: x.row.analyst_name,
      programTypeId: x.row.program_type_id,
      programTypeName: x.row.program_type_name,
    };
  });

  // Seat scoping (operators get their slice; estate sees all — docs/20 P1.7).
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
  const totalCount = all.length;
  const scopedCount = isEstate ? totalCount : scopedIds.size;
  const showingAll = isEstate || !!showAll;
  const bubbles = showingAll ? all : all.filter((b) => scopedIds.has(b.id));

  return {
    bubbles,
    scope: {
      tier: isEstate ? 'estate' : 'operator',
      scopedCount,
      totalCount,
      showingAll,
    },
    meta: { curY, prevY, curMaxP, fullFY },
  };
}
