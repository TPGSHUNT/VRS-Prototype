'use server';

// Scope summary for the role-selection screen's detail pane. Intentionally
// UNauthenticated — this runs pre-login (it IS the seat picker); the role-sim
// model has no real auth. Read-only aggregates, scoped by the same rules as
// the bubble field (estate vs operator).

import { prisma, Prisma } from '@vrs/db';

export interface ScopeSummary {
  name: string;
  roleLabel: string;
  kind: 'estate' | 'operator';
  vendorCount: number;
  programCount: number;
  agreementCount: number;
  annualEarnings: number; // normalized positive
  contractValue: number;
  sampleVendors: string[];
}

const ROLE_LABELS: Record<string, string> = {
  AP_MANAGER: 'AP Manager',
  AP_ANALYST: 'AP Analyst',
  BUYER: 'Buyer',
  BUYER_DELEGATE: 'Buyer Delegate',
  DMM: 'District Merch Manager',
  GMM: 'General Merch Manager',
  READ_ONLY: 'Finance / Audit (read-only)',
};
const ESTATE = new Set(['AP_MANAGER', 'READ_ONLY']);

export async function getUserScopeSummary(
  email: string,
): Promise<ScopeSummary | null> {
  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true },
  });
  if (!u) return null;
  const base = {
    name: u.name,
    roleLabel: ROLE_LABELS[u.role] ?? u.role,
  };

  // ── Estate (AP Manager / Finance-Audit): the whole book ──────────────
  if (ESTATE.has(u.role)) {
    const [agg] = await prisma.$queryRaw<
      { vc: number; pc: number; ac: number; ae: number; cv: number }[]
    >(Prisma.sql`
      SELECT
        (SELECT count(*) FROM "Vendor" WHERE active)::int vc,
        (SELECT count(*) FROM "RebateProgram")::int pc,
        (SELECT count(*) FROM "Agreement")::int ac,
        (SELECT COALESCE(SUM("finalEarnings"),0) FROM "CalculateResult")::float8 ae,
        (SELECT COALESCE(SUM("estimatedValue"),0) FROM "Agreement")::float8 cv
    `);
    const sv = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
      SELECT v.name FROM "Vendor" v
      JOIN "RebateVendor" rv ON rv."vendorId"=v.id
      JOIN "RebateVendorDept" d ON d."rebateVendorId"=rv.id
      JOIN "CalculateResult" c ON c."rebateVendorDeptId"=d.id
      GROUP BY v.name ORDER BY SUM(c."finalEarnings") DESC NULLS LAST LIMIT 5
    `);
    return {
      ...base,
      kind: 'estate',
      vendorCount: Number(agg.vc),
      programCount: Number(agg.pc),
      agreementCount: Number(agg.ac),
      annualEarnings: Number(agg.ae),
      contractValue: Number(agg.cv),
      sampleVendors: sv.map((r) => r.name),
    };
  }

  // ── Operator: scope by the same rule the bubble field uses ───────────
  if (u.role === 'AP_ANALYST') {
    const [a] = await prisma.$queryRaw<
      { vc: number; pc: number; ae: number }[]
    >(Prisma.sql`
      SELECT count(DISTINCT v.id)::int vc, count(DISTINCT rp.id)::int pc,
             COALESCE(SUM(c."finalEarnings"),0)::float8 ae
      FROM "RebateProgram" rp
      JOIN "RebateVendor" rv ON rv."rebateProgramId"=rp.id
      JOIN "Vendor" v ON v.id=rv."vendorId"
      JOIN "RebateVendorDept" d ON d."rebateVendorId"=rv.id
      LEFT JOIN "CalculateResult" c ON c."rebateVendorDeptId"=d.id
      WHERE rp."analystId"=${u.id}
    `);
    const sv = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
      SELECT DISTINCT v.name FROM "RebateProgram" rp
      JOIN "RebateVendor" rv ON rv."rebateProgramId"=rp.id
      JOIN "Vendor" v ON v.id=rv."vendorId"
      WHERE rp."analystId"=${u.id} ORDER BY v.name LIMIT 5
    `);
    return {
      ...base, kind: 'operator',
      vendorCount: Number(a.vc), programCount: Number(a.pc),
      agreementCount: 0, annualEarnings: Number(a.ae),
      contractValue: 0, sampleVendors: sv.map((r) => r.name),
    };
  }

  // BUYER / BUYER_DELEGATE / DMM / GMM → scope via Agreement
  const own =
    u.role === 'DMM'
      ? Prisma.sql`a."dmmApprovedBy"=${u.id} OR a.status='PENDING_DMM_APPROVAL'`
      : u.role === 'GMM'
        ? Prisma.sql`a."gmmApprovedBy"=${u.id} OR a.status='PENDING_GMM_APPROVAL'`
        : Prisma.sql`a."buyerId"=${u.id} OR a."delegateId"=${u.id}`;
  const [a] = await prisma.$queryRaw<
    { vc: number; ac: number; cv: number }[]
  >(Prisma.sql`
    SELECT count(DISTINCT a."vendorId")::int vc, count(*)::int ac,
           COALESCE(SUM(a."estimatedValue"),0)::float8 cv
    FROM "Agreement" a WHERE ${own}
  `);
  const sv = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
    SELECT DISTINCT v.name FROM "Agreement" a
    JOIN "Vendor" v ON v.id=a."vendorId"
    WHERE ${own} ORDER BY v.name LIMIT 5
  `);
  return {
    ...base, kind: 'operator',
    vendorCount: Number(a.vc), programCount: 0,
    agreementCount: Number(a.ac), annualEarnings: 0,
    contractValue: Number(a.cv), sampleVendors: sv.map((r) => r.name),
  };
}
