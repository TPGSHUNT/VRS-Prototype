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
      agreements: { select: { status: true, estimatedValue: true } },
      analyticsSummaries: { select: { transactionVolume: true } },
      rebateVendors: {
        include: {
          rebateProgram: { select: { active: true } },
          invoices: { where: { status: { not: 'PAID' } }, select: { id: true } },
          rebateVendorDepts: {
            include: {
              calculateResults: {
                select: {
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
  const invoices = v.rebateVendors.flatMap((rv) => rv.invoices);

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
      openInvoices: invoices.length,
    },
    counts: {
      programs: v.rebateVendors.filter((rv) => rv.rebateProgram.active).length,
      calculations: calcs.length,
      agreements: v.agreements.length,
      invoices: invoices.length,
    },
  };
}
