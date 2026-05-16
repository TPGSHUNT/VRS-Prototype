'use server';

// Server Function — on-demand vendor-record fetch for the right slider (P1.1).
// Invoked from the client on bubble click. Per the modified-Next docs
// (07-mutating-data): server functions are directly POST-reachable, so the
// session MUST be verified inside. No new route — this overlays the single
// bubble-field page via client state (design language §1.2).

import { prisma } from '@vrs/db';
import { auth } from '../../auth';

export interface VendorRecord {
  vendor: {
    id: string;
    name: string;
    vendorNumber: number;
    apNumber: string | null;
    ipNumber: number | null;
    active: boolean;
  };
  overview: {
    // normalized positive = value to DG (Decision ①)
    annualEarnings: number;
    // legacy/source sign convention (negative = vendor owes DG) — Accounting view
    annualEarningsLegacy: number;
    components: {
      pmu: number;
      margin: number;
      advcoop: number;
      otherCoop: number;
    };
    grossVolume: number;
    contractValue: number;
    openInvoices: number;
  };
  calculations: Array<{
    program: number;
    dept: string;
    year: number;
    period: number;
    status: string;
    finalEarnings: number; // normalized positive
    finalEarningsLegacy: number; // legacy sign
  }>;
  agreements: Array<{
    agmtId: number;
    description: string;
    merchType: string;
    source: string;
    status: string;
    estimatedValue: number;
    startDate: string;
    endDate: string;
  }>;
  programs: Array<{
    program: number;
    type: string;
    source: string;
    active: boolean;
    analyst: string | null;
    depts: number;
    earnings: number; // this vendor's normalized earnings under the program
  }>;
  invoices: Array<{
    number: string;
    year: number;
    period: number;
    type: string;
    amount: number;
    status: string;
    dueDate: string;
    paid: boolean;
  }>;
  // Tab counts so headers are real even before each tab's body is built.
  counts: {
    programs: number;
    calculations: number;
    agreements: number;
    invoices: number;
  };
}

const IN_FLIGHT_AGREEMENT = [
  'SUBMITTED_BY_VENDOR',
  'PRE_NEGOTIATION',
  'PENDING_DMM_APPROVAL',
  'PENDING_GMM_APPROVAL',
  'PENDING_AP_APPROVAL',
  'ASSIGNED',
];

export async function getVendorRecord(
  vendorId: string,
): Promise<VendorRecord | null> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const v = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      agreements: {
        select: {
          agmtId: true,
          description: true,
          merchType: true,
          source: true,
          status: true,
          estimatedValue: true,
          startDate: true,
          endDate: true,
        },
      },
      analyticsSummaries: { select: { transactionVolume: true } },
      rebateVendors: {
        include: {
          rebateProgram: {
            select: {
              active: true,
              programNumber: true,
              rebateTypeCode: true,
              source: true,
              analyst: { select: { name: true } },
            },
          },
          invoices: {
            select: {
              invoiceNumber: true,
              fiscalPeriod: true,
              fiscalYear: true,
              invoiceType: true,
              amount: true,
              status: true,
              dueDate: true,
              paidAt: true,
            },
          },
          rebateVendorDepts: {
            select: {
              departmentCode: true,
              calculateResults: {
                select: {
                  fiscalPeriod: true,
                  fiscalYear: true,
                  status: true,
                  pmuEarnings: true,
                  marginEarnings: true,
                  advcoopEarnings: true,
                  otherCoopEarnings: true,
                  finalEarnings: true,
                  finalEarningsLegacy: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!v) return null;

  const num = (d: unknown) => (d == null ? 0 : Number(d));

  const calcs = v.rebateVendors.flatMap((rv) =>
    rv.rebateVendorDepts.flatMap((rvd) => rvd.calculateResults),
  );
  const allInvoices = v.rebateVendors.flatMap((rv) => rv.invoices);
  const openInvoiceCount = allInvoices.filter(
    (i) => String(i.status) !== 'PAID',
  ).length;

  const programs = v.rebateVendors
    .map((rv) => ({
      program: rv.rebateProgram.programNumber,
      type: rv.rebateProgram.rebateTypeCode,
      source: String(rv.rebateProgram.source),
      active: rv.rebateProgram.active,
      analyst: rv.rebateProgram.analyst?.name ?? null,
      depts: rv.rebateVendorDepts.length,
      earnings: rv.rebateVendorDepts.reduce(
        (s, d) =>
          s + d.calculateResults.reduce((t, c) => t + num(c.finalEarnings), 0),
        0,
      ),
    }))
    .sort((a, b) => b.earnings - a.earnings);

  const invoices = allInvoices
    .map((i) => ({
      number: i.invoiceNumber,
      year: i.fiscalYear,
      period: i.fiscalPeriod,
      type: String(i.invoiceType),
      amount: num(i.amount),
      status: String(i.status),
      dueDate: i.dueDate.toISOString().slice(0, 10),
      paid: i.paidAt != null,
    }))
    .sort((a, b) => b.year - a.year || b.period - a.period)
    .slice(0, 300);

  const calculations = v.rebateVendors
    .flatMap((rv) =>
      rv.rebateVendorDepts.flatMap((rvd) =>
        rvd.calculateResults.map((c) => ({
          program: rv.rebateProgram.programNumber,
          dept: rvd.departmentCode,
          year: c.fiscalYear,
          period: c.fiscalPeriod,
          status: String(c.status),
          finalEarnings: num(c.finalEarnings),
          finalEarningsLegacy: num(c.finalEarningsLegacy),
        })),
      ),
    )
    .sort((a, b) => b.year - a.year || b.period - a.period)
    .slice(0, 500);

  const agreements = v.agreements
    .map((a) => ({
      agmtId: a.agmtId,
      description: a.description,
      merchType: String(a.merchType),
      source: String(a.source),
      status: String(a.status),
      estimatedValue: num(a.estimatedValue),
      startDate: a.startDate.toISOString().slice(0, 10),
      endDate: a.endDate.toISOString().slice(0, 10),
    }))
    .sort((a, b) => a.status.localeCompare(b.status));

  const components = calcs.reduce(
    (a, c) => ({
      pmu: a.pmu + num(c.pmuEarnings),
      margin: a.margin + num(c.marginEarnings),
      advcoop: a.advcoop + num(c.advcoopEarnings),
      otherCoop: a.otherCoop + num(c.otherCoopEarnings),
    }),
    { pmu: 0, margin: 0, advcoop: 0, otherCoop: 0 },
  );

  return {
    vendor: {
      id: v.id,
      name: v.name,
      vendorNumber: v.vendorNumber,
      apNumber: v.apNumber,
      ipNumber: v.ipNumber,
      active: v.active,
    },
    overview: {
      annualEarnings: calcs.reduce((s, c) => s + num(c.finalEarnings), 0),
      annualEarningsLegacy: calcs.reduce(
        (s, c) => s + num(c.finalEarningsLegacy),
        0,
      ),
      components,
      grossVolume: v.analyticsSummaries.reduce(
        (s, a) => s + num(a.transactionVolume),
        0,
      ),
      contractValue: v.agreements
        .filter((a) => IN_FLIGHT_AGREEMENT.includes(a.status))
        .reduce((s, a) => s + num(a.estimatedValue), 0),
      openInvoices: openInvoiceCount,
    },
    calculations,
    agreements,
    programs,
    invoices,
    counts: {
      programs: programs.length,
      calculations: calcs.length,
      agreements: v.agreements.length,
      invoices: allInvoices.length,
    },
  };
}
