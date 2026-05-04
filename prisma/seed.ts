// VRS prototype seed script
// Runs against local Postgres. Idempotent — wipes data first.
// Counts and bubble-color distribution match docs/04-schema-addendum.md §3 + §4.
// MerchType / ProgramType / vendor numbering aligned with Ken's CSV samples.
//
// Pending Ken inputs (placeholders below): full department code list, real GL accounts,
// fiscal calendar dates, approval thresholds, NSA subsystem details.

import {
  prisma,
  Source,
  MerchType,
  AgreementStatus,
  CalculateResultStatus,
  UserRole,
  FunctionType,
  TargetSystem,
  NotificationType,
} from '@vrs/db';

// ─── Deterministic RNG ──────────────────────────────────────────────────────

function makeRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rng = makeRng();
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const intBetween = (lo: number, hi: number) =>
  Math.floor(lo + rng() * (hi - lo + 1));
const decBetween = (lo: number, hi: number) =>
  Number((lo + rng() * (hi - lo)).toFixed(2));

// ─── Reference data ─────────────────────────────────────────────────────────

// 40 real DG vendor names from VRS_Vendors.xlsx + 10 synthesized
const REAL_VENDOR_NAMES = [
  'PEPSICO BEVERAGE SALES LLC',
  'COCA COLA BOTTLERS',
  'DR PEPPER SNAPPLE GROUP',
  'PROCTER & GAMBLE-EDI',
  'ROLLING FRITO LAY SALES LP',
  'GENERAL MILLS',
  'KRAFT HEINZ FOODS COMPANY',
  'UNILEVER',
  'DFA DAIRY BRANDS CORPORATE LLC',
  'RED BULL NORTH AMERICA INC',
  'HERSHEY CHOCOLATE USA-EDI',
  'NESTLE',
  'J M SMUCKER LLC',
  'NESTLE PURINA PETCARE COMPANY',
  'MARS PETCARE US INC',
  'MONSTER ENERGY COMPANY',
  'DREYERS GRAND ICE CREAM INC',
  'INTERACTIVE COMMUNICATIONS INT',
  'JTI LIGGETT LLC',
  'MARS WRIGLEY CONFECTIONERY US',
  'POST HOLDINGS INC',
  'CONAGRA FOODS',
  'COLGATE PALMOLIVE',
  'MONDELEZ GLOBAL LLC NABISCO',
  'KIMBERLY CLARK CORPORATION',
  'KELLANOVA',
  'CLOROX SALES COMPANY',
  'CHURCH & DWIGHT CO INC',
  'DIAL CORP',
  'EMERSON HEALTHCARE LLC',
  'SMITHFIELD PACKAGED MEATS',
  'S C JOHNSON & SON-EDI',
  'KENVUE BRANDS LLC',
  'DANONE US INC',
  'RECKITT BENCKISER',
  'ITG BRANDS LLC',
  'HANESBRANDS LLC',
  'ENERGIZER LLC',
  'GEORGIA PACIFIC CONSUMER PROD',
  'HOSTESS BRANDS INC',
];
const SYNTHESIZED_VENDOR_NAMES = [
  'CHURCH OF SCENT-EDI',
  'PRESTIGE HOUSEWARES INC',
  'BLUE RIDGE SNACKS LLC',
  'TURNKEY GENERAL MERCH',
  'STARBOARD APPAREL CO',
  'NORTHWIND PET SUPPLY',
  'CRESTWOOD BEVERAGE GROUP',
  'PRAIRIE CONFECTIONS LLC',
  'STERLING PAPER PRODUCTS',
  'EVERGREEN HOMECARE LLC',
];
const VENDOR_NAMES = [...REAL_VENDOR_NAMES, ...SYNTHESIZED_VENDOR_NAMES];

// Department codes — placeholder until Ken provides full list (see request item A.1).
// Real codes are 3-digit numeric (Ken's extract shows 100, 210, etc.).
const DEPARTMENTS: Array<{ code: string; name: string }> = [
  { code: '100', name: 'Beverages' },
  { code: '120', name: 'Snacks' },
  { code: '140', name: 'Confectionery' },
  { code: '160', name: 'Frozen Foods' },
  { code: '180', name: 'Dairy' },
  { code: '200', name: 'Pet' },
  { code: '210', name: 'Cleaning Supplies' },
  { code: '220', name: 'Paper Products' },
  { code: '240', name: 'Personal Care' },
  { code: '260', name: 'Health & Beauty' },
  { code: '300', name: 'Apparel' },
  { code: '400', name: 'General Merchandise' },
];

// ProgramType — values from ActVrs_Plan.csv (Ken's roll-up sample).
// Replaces the original RebateCategory's HBA/GROCERY/etc. groupings, which were
// a fiction; real DG VRS doesn't use that taxonomy at the program level.
const PROGRAM_TYPES: Array<{ code: string; name: string }> = [
  { code: 'ADV_COOP', name: 'Advertising Coop' },
  { code: 'CLIP_STRIP', name: 'Clip Strip' },
  { code: 'COMPANY_MTG', name: 'Company Meeting' },
  { code: 'COMP_PRICE_PROT', name: 'Competitive Price Protection' },
  { code: 'COST_INC_ADM', name: 'Cost Increase Admin Fee' },
  { code: 'CUSTOMER_BB', name: 'Customer Bounceback Program' },
  { code: 'DG_HERO', name: 'DG Hero Program' },
  { code: 'DG_MEDIA', name: 'DG Media Network' },
  { code: 'DG_PICKUP', name: 'DG Pickup Allowance' },
  { code: 'DAMAGES', name: 'Damages' },
  { code: 'END_CAP', name: 'End Cap' },
  { code: 'EXCLUSIVITY', name: 'Exclusivity' },
  { code: 'FIXTURES', name: 'Fixtures/Sign/Display' },
  { code: 'FRONT_END', name: 'Front End' },
  { code: 'LABOR_FUND', name: 'Labor Funding' },
  { code: 'MARKDOWN_CORE', name: 'Markdown Core' },
  { code: 'MARKDOWN_NC', name: 'Markdown Non Core' },
  { code: 'MARKET_STORE', name: 'Market Store' },
  { code: 'MILK', name: 'Milk' },
  { code: 'NEW_ITEM', name: 'New Item/Slotting Allowance' },
  { code: 'OTHER', name: 'Other' },
  { code: 'PLACEMENT', name: 'Placement Allowance' },
  { code: 'PLACEMENT_COKE', name: 'Placement Coke' },
  { code: 'PLACEMENT_PEPSI', name: 'Placement Pepsi' },
  { code: 'POST_AUDIT', name: 'Post Audit' },
  { code: 'PRIV_BRANDS', name: 'Private Brands' },
  { code: 'RECALL', name: 'Recall/Product Removal' },
  { code: 'SCANBACKS', name: 'Scanbacks' },
  { code: 'SIDE_WING', name: 'Side Wing' },
  { code: 'SUPPLY_CHAIN', name: 'Supply Chain' },
  { code: 'TPR', name: 'Temporary Price Reduction' },
  { code: 'VOLUME', name: 'Volume' },
  { code: 'VOLUME_COKE', name: 'Volume Coke' },
  { code: 'VOLUME_GROWTH', name: 'Volume Growth Incentive' },
  { code: 'VOLUME_PEPSI', name: 'Volume Pepsi' },
  { code: 'NEW_STORE', name: 'New Store Allowance' },
];

// RebateType compound codes — keeping the Source-MerchType bridge structure
// per schema docs until Ken clarifies whether real DG codes are unitary or compound.
// (See /docs/05-info-needed-from-ken.md — deferred clarification.)
const REBATE_TYPES: Array<{
  code: string;
  source: Source;
  merchType: MerchType;
  description: string;
}> = [
  { code: 'R-COTRKT', source: Source.R, merchType: MerchType.COTRKT, description: 'Receipts contract rebate' },
  { code: 'R-NSA', source: Source.R, merchType: MerchType.NSA, description: 'Receipts NSA' },
  { code: 'S-NSA', source: Source.S, merchType: MerchType.NSA, description: 'Sales NSA' },
  { code: 'S-SCNBK', source: Source.S, merchType: MerchType.SCNBK, description: 'Sales scanback' },
  { code: 'D-COTRKT', source: Source.D, merchType: MerchType.COTRKT, description: 'Drop-ship contract' },
  { code: 'N-ADVCOOP', source: Source.N, merchType: MerchType.ADVCOOP, description: 'Fixed advertising coop' },
  { code: 'N-OTHER', source: Source.N, merchType: MerchType.OTHER, description: 'Fixed other rebate' },
  { code: 'C-TPR', source: Source.C, merchType: MerchType.TPR, description: 'Discount-based TPR' },
  { code: 'B-COTRKT', source: Source.B, merchType: MerchType.COTRKT, description: 'Import receipts contract' },
  { code: 'S-S5S5', source: Source.S, merchType: MerchType.S5S5, description: 'Sales 5x5 promotional' },
  { code: 'R-PREPAID', source: Source.R, merchType: MerchType.PREPAID, description: 'Receipts prepaid rebate' },
  { code: 'R-DGMEDIAN', source: Source.R, merchType: MerchType.DGMEDIAN, description: 'Receipts DG Media Network' },
  { code: 'R-PRIVBRND', source: Source.R, merchType: MerchType.PRIVBRND, description: 'Receipts private brand' },
  { code: 'R-VOLUME', source: Source.R, merchType: MerchType.VOLUME, description: 'Receipts volume rebate' },
  { code: 'R-DMGDC', source: Source.R, merchType: MerchType.DMGDC, description: 'Receipts damages DC' },
];

const USERS: Array<{
  email: string;
  name: string;
  analystCode: string;
  role: UserRole;
}> = [
  { email: 'lane.b@dollargeneral.com', name: 'Lane B.', analystCode: 'LB', role: UserRole.AP_ANALYST },
  { email: 'mark.k@dollargeneral.com', name: 'Mark K.', analystCode: 'MK', role: UserRole.AP_MANAGER },
  { email: 'j.alvarez@dollargeneral.com', name: 'J. Alvarez', analystCode: 'JA', role: UserRole.BUYER },
  { email: 'robin.w@dollargeneral.com', name: 'Robin W.', analystCode: 'RW', role: UserRole.BUYER_DELEGATE },
  { email: 'dana.m@dollargeneral.com', name: 'Dana M.', analystCode: 'DM', role: UserRole.DMM },
  { email: 'glen.r@dollargeneral.com', name: 'Glen R.', analystCode: 'GR', role: UserRole.GMM },
  { email: 'audit@dollargeneral.com', name: 'Read-Only Auditor', analystCode: 'EX', role: UserRole.READ_ONLY },
];

// Placeholder fiscal calendar — Ken to confirm actual DG dates (request item A.4)
const FISCAL_PERIODS = [
  { fiscalPeriod: 1, fiscalYear: 2025, periodStart: '2025-02-02', periodEnd: '2025-03-01', isClosed: true },
  { fiscalPeriod: 2, fiscalYear: 2025, periodStart: '2025-03-02', periodEnd: '2025-03-29', isClosed: true },
  { fiscalPeriod: 3, fiscalYear: 2025, periodStart: '2025-03-30', periodEnd: '2025-05-03', isClosed: true },
  { fiscalPeriod: 4, fiscalYear: 2025, periodStart: '2025-05-04', periodEnd: '2025-05-31', isClosed: true },
  { fiscalPeriod: 5, fiscalYear: 2025, periodStart: '2025-06-01', periodEnd: '2025-06-28', isClosed: false },
];

// Pay Type / Earn Type / SBT Type codes — values from extract; meanings TBD with Ken.
const PAY_TYPES = ['C', 'D', 'G', 'M', 'T', 'W'];
const FREQUENCIES = ['P']; // Period
const EARN_TYPES = ['M'];
const SBT_TYPES = ['N'];

// ─── Wipe ───────────────────────────────────────────────────────────────────

async function wipe() {
  console.log('› wiping existing data...');
  await prisma.notification.deleteMany();
  await prisma.analyticsSummary.deleteMany();
  await prisma.reportJob.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.deduction.deleteMany();
  await prisma.check.deleteMany();
  await prisma.calculateResultAdjustment.deleteMany();
  await prisma.batchItem.deleteMany();
  await prisma.acctControlMaster.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.calculateResult.deleteMany();
  await prisma.rebateVendorDept.deleteMany();
  await prisma.rebateVendor.deleteMany();
  await prisma.rebateTier.deleteMany();
  await prisma.rebateProgram.deleteMany();
  await prisma.agreement.deleteMany();
  await prisma.vendorPortalUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.rebateType.deleteMany();
  await prisma.programType.deleteMany();
  await prisma.fiscalPeriod.deleteMany();
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  await wipe();

  // Fiscal periods
  console.log('› fiscal periods');
  for (const fp of FISCAL_PERIODS) {
    await prisma.fiscalPeriod.create({
      data: {
        fiscalPeriod: fp.fiscalPeriod,
        fiscalYear: fp.fiscalYear,
        periodStart: new Date(fp.periodStart),
        periodEnd: new Date(fp.periodEnd),
        isClosed: fp.isClosed,
        closedAt: fp.isClosed ? new Date(fp.periodEnd) : null,
      },
    });
  }

  // Program types
  console.log('› program types');
  await prisma.programType.createMany({ data: PROGRAM_TYPES });
  const programTypes = await prisma.programType.findMany();
  const programTypeByCode = new Map(programTypes.map((p) => [p.code, p]));

  // Rebate types
  console.log('› rebate types');
  await prisma.rebateType.createMany({ data: REBATE_TYPES });

  // Users
  console.log('› users');
  await prisma.user.createMany({ data: USERS });
  const users = await prisma.user.findMany();
  const userByCode = new Map(users.map((u) => [u.analystCode!, u]));
  const apAnalyst = userByCode.get('LB')!;
  const apManager = userByCode.get('MK')!;
  const buyer = userByCode.get('JA')!;
  const buyerDelegate = userByCode.get('RW')!;
  const dmm = userByCode.get('DM')!;
  const gmm = userByCode.get('GR')!;

  // Vendors — vendorNumber is plain integer (Int), matches real AP # format
  console.log('› vendors');
  const vendors = await Promise.all(
    VENDOR_NAMES.map(async (name, i) => {
      // AP # range loosely matches Ken's data (1,000–300,000)
      const vendorNumber = 1000 + i * 6427 + intBetween(0, 50); // spread non-sequentially
      return prisma.vendor.create({
        data: { vendorNumber, name },
      });
    }),
  );
  const largeVendors = vendors.slice(0, 5);
  const midVendors = vendors.slice(5, 20);
  const smallVendors = vendors.slice(20);

  // ─── Bubble color fate assignment ────────────────────────────────────────
  const shuffled = [...vendors].sort(() => rng() - 0.5);
  const redVendors = shuffled.slice(0, 5);
  const amberVendors = shuffled.slice(5, 15);
  const greenVendors = shuffled.slice(15);
  const queuePendingVendors = amberVendors.slice(0, 8);

  console.log(
    `  bubble fates: ${greenVendors.length} green / ${amberVendors.length} amber / ${redVendors.length} red`,
  );

  // ─── Agreements (~85 total) ─────────────────────────────────────────────
  console.log('› agreements');

  type SeededAgreement = {
    id: string;
    vendorId: string;
    merchType: MerchType;
    source: Source;
    programTypeId: string;
    rebateTypeCode: string;
    status: AgreementStatus;
  };
  const seededAgreements: SeededAgreement[] = [];

  const randomRebateType = () => pick(REBATE_TYPES);
  const randomProgramType = () => pick(programTypes);

  // 8 PENDING_AP_APPROVAL — drives the bubble pulsing rings
  for (const v of queuePendingVendors) {
    const rt = randomRebateType();
    const pt = randomProgramType();
    const a = await prisma.agreement.create({
      data: {
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `Q${intBetween(1, 4)} ${rt.merchType} program with ${v.name.split(' ').slice(0, 2).join(' ')}`,
        buyerId: buyer.id,
        programTypeId: pt.id,
        estimatedValue: decBetween(50_000, 2_500_000),
        startDate: new Date('2025-06-01'),
        endDate: new Date('2026-05-31'),
        status: AgreementStatus.PENDING_AP_APPROVAL,
        dmmApprovedBy: dmm.id,
        dmmApprovedAt: new Date('2025-05-20'),
        gmmApprovedBy: gmm.id,
        gmmApprovedAt: new Date('2025-05-22'),
      },
    });
    seededAgreements.push({
      id: a.id,
      vendorId: a.vendorId,
      merchType: a.merchType,
      source: a.source,
      programTypeId: a.programTypeId,
      rebateTypeCode: rt.code,
      status: a.status,
    });
  }

  // 1 demo agreement at PENDING_GMM_APPROVAL — full chain demo
  {
    const v = greenVendors[0]!;
    const rt = REBATE_TYPES.find((x) => x.code === 'R-COTRKT')!;
    const pt = programTypeByCode.get('ADV_COOP')!;
    const a = await prisma.agreement.create({
      data: {
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: 'AGR-DEMO-001 — full chain demo (HBA tier renegotiation)',
        buyerId: buyer.id,
        programTypeId: pt.id,
        estimatedValue: 4_750_000,
        startDate: new Date('2025-07-01'),
        endDate: new Date('2026-06-30'),
        status: AgreementStatus.PENDING_GMM_APPROVAL,
        dmmApprovedBy: dmm.id,
        dmmApprovedAt: new Date('2025-05-25'),
      },
    });
    seededAgreements.push({
      id: a.id,
      vendorId: a.vendorId,
      merchType: a.merchType,
      source: a.source,
      programTypeId: a.programTypeId,
      rebateTypeCode: rt.code,
      status: a.status,
    });
  }

  // ~50 ASSIGNED agreements
  const assignedAgreementCount = 50;
  for (let i = 0; i < assignedAgreementCount; i++) {
    const v = pick(vendors);
    const rt = randomRebateType();
    const pt = randomProgramType();
    const a = await prisma.agreement.create({
      data: {
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `${rt.merchType} program for ${v.name.split(' ')[0]}`,
        buyerId: pick([buyer.id, buyerDelegate.id]),
        programTypeId: pt.id,
        estimatedValue: decBetween(25_000, 8_000_000),
        startDate: new Date('2025-02-02'),
        endDate: new Date('2026-01-31'),
        status: AgreementStatus.ASSIGNED,
        dmmApprovedBy: dmm.id,
        dmmApprovedAt: new Date('2024-12-10'),
        gmmApprovedBy: rng() > 0.5 ? gmm.id : null,
        gmmApprovedAt: rng() > 0.5 ? new Date('2024-12-15') : null,
        apApprovedBy: apAnalyst.id,
        apApprovedAt: new Date('2024-12-20'),
      },
    });
    seededAgreements.push({
      id: a.id,
      vendorId: a.vendorId,
      merchType: a.merchType,
      source: a.source,
      programTypeId: a.programTypeId,
      rebateTypeCode: rt.code,
      status: a.status,
    });
  }

  // 10 PRE_NEGOTIATION
  for (let i = 0; i < 10; i++) {
    const v = pick(vendors);
    const rt = randomRebateType();
    const pt = randomProgramType();
    await prisma.agreement.create({
      data: {
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `Draft: ${rt.merchType} for ${v.name.split(' ')[0]}`,
        buyerId: pick([buyer.id, buyerDelegate.id]),
        programTypeId: pt.id,
        estimatedValue: decBetween(15_000, 1_500_000),
        startDate: new Date('2026-02-01'),
        endDate: new Date('2027-01-31'),
        status: AgreementStatus.PRE_NEGOTIATION,
      },
    });
  }

  // Terminal statuses
  const terminalStatuses: AgreementStatus[] = [
    ...Array(5).fill(AgreementStatus.EXPIRED),
    ...Array(3).fill(AgreementStatus.REJECTED),
    ...Array(2).fill(AgreementStatus.CANCELLED),
    ...Array(6).fill(AgreementStatus.SUBMITTED_BY_VENDOR),
  ];
  for (const status of terminalStatuses) {
    const v = pick(vendors);
    const rt = randomRebateType();
    const pt = randomProgramType();
    const submittedViaPortal = status === AgreementStatus.SUBMITTED_BY_VENDOR;
    await prisma.agreement.create({
      data: {
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `${status} agreement`,
        buyerId: buyer.id,
        programTypeId: pt.id,
        estimatedValue: decBetween(20_000, 1_000_000),
        startDate: new Date('2024-02-01'),
        endDate: new Date('2025-01-31'),
        status,
        submittedViaPortal,
        rejectedBy: status === AgreementStatus.REJECTED ? apAnalyst.id : null,
        rejectedAt: status === AgreementStatus.REJECTED ? new Date('2025-01-15') : null,
        rejectionReason: status === AgreementStatus.REJECTED ? 'Estimated value below threshold' : null,
      },
    });
  }

  // ─── Rebate programs (150) ─────────────────────────────────────────────
  console.log('› rebate programs');
  type SeededProgram = {
    id: string;
    rebateTypeCode: string;
    source: Source;
    merchType: MerchType;
    programTypeId: string;
  };
  const seededPrograms: SeededProgram[] = [];

  const assignedAgreements = seededAgreements.filter(
    (a) => a.status === AgreementStatus.ASSIGNED,
  );

  // Plain integer programNumbers, range 1000-100000
  let programNumberSeq = intBetween(1000, 5000);

  for (let i = 0; i < assignedAgreements.length; i++) {
    const ag = assignedAgreements[i]!;
    const rt = REBATE_TYPES.find((x) => x.code === ag.rebateTypeCode)!;
    programNumberSeq += intBetween(50, 800);
    const p = await prisma.rebateProgram.create({
      data: {
        programNumber: programNumberSeq,
        description: `Program from agreement ${ag.id.slice(0, 8)}`,
        rebateTypeCode: rt.code,
        programTypeId: ag.programTypeId,
        source: rt.source,
        analystId: apAnalyst.id,
        agreementId: ag.id,
        startDate: new Date('2025-02-02'),
        endDate: new Date('2026-01-31'),
        payType: pick(PAY_TYPES),
        frequency: pick(FREQUENCIES),
        altApNumber: rng() > 0.7 ? intBetween(1000, 99999) : null,
        payApNumber: rng() > 0.7 ? intBetween(1000, 99999) : null,
        earnType: pick(EARN_TYPES),
        sbtType: pick(SBT_TYPES),
        pctOfCost: decBetween(0.001, 0.05),
        pctLevel: rng() > 0.3 ? 'Dept' : null,
      },
    });
    seededPrograms.push({
      id: p.id,
      rebateTypeCode: rt.code,
      source: rt.source,
      merchType: rt.merchType,
      programTypeId: ag.programTypeId,
    });
  }

  const freeStandingCount = 150 - assignedAgreements.length;
  for (let i = 0; i < freeStandingCount; i++) {
    const rt = randomRebateType();
    const pt = randomProgramType();
    programNumberSeq += intBetween(50, 800);
    const p = await prisma.rebateProgram.create({
      data: {
        programNumber: programNumberSeq,
        description: `Standing program ${rt.code} ${pt.code}`,
        rebateTypeCode: rt.code,
        programTypeId: pt.id,
        source: rt.source,
        analystId: apAnalyst.id,
        startDate: new Date('2025-02-02'),
        endDate: new Date('2026-01-31'),
        payType: pick(PAY_TYPES),
        frequency: pick(FREQUENCIES),
        altApNumber: rng() > 0.7 ? intBetween(1000, 99999) : null,
        payApNumber: rng() > 0.7 ? intBetween(1000, 99999) : null,
        earnType: pick(EARN_TYPES),
        sbtType: pick(SBT_TYPES),
        pctOfCost: decBetween(0.001, 0.05),
        pctLevel: rng() > 0.3 ? 'Dept' : null,
      },
    });
    seededPrograms.push({
      id: p.id,
      rebateTypeCode: rt.code,
      source: rt.source,
      merchType: rt.merchType,
      programTypeId: pt.id,
    });
  }

  // ─── Rebate tiers (~300) ──────────────────────────────────────────────
  console.log('› rebate tiers');
  for (const p of seededPrograms) {
    // Per Ken: NSA programs have NO tiers (have their own subsystem).
    if (p.merchType === MerchType.NSA) continue;
    const tierCount = intBetween(2, 3);
    let from = 0;
    for (let t = 1; t <= tierCount; t++) {
      const isLast = t === tierCount;
      const to = isLast ? null : from + intBetween(2_000_000, 8_000_000);
      const rate = Number((0.01 + 0.005 * t + rng() * 0.005).toFixed(6));
      await prisma.rebateTier.create({
        data: {
          rebateProgramId: p.id,
          tierLevel: t,
          fromAmount: from,
          toAmount: to,
          rate,
          tierType: 'INCREMENTAL',
        },
      });
      if (to !== null) from = to + 1;
    }
  }

  // ─── Rebate vendors (~180) ──────────────────────────────────────────
  console.log('› rebate vendors');
  type SeededRebateVendor = {
    id: string;
    rebateProgramId: string;
    vendorId: string;
    program: SeededProgram;
  };
  const seededRebateVendors: SeededRebateVendor[] = [];
  for (const p of seededPrograms) {
    const vendorCount = rng() < 0.2 ? intBetween(2, 3) : 1;
    const programVendors = new Set<string>();
    for (let i = 0; i < vendorCount; i++) {
      const v = rng() < 0.4 ? pick(largeVendors) : rng() < 0.6 ? pick(midVendors) : pick(smallVendors);
      if (programVendors.has(v.id)) continue;
      programVendors.add(v.id);
      const rv = await prisma.rebateVendor.create({
        data: { rebateProgramId: p.id, vendorId: v.id },
      });
      seededRebateVendors.push({ id: rv.id, rebateProgramId: p.id, vendorId: v.id, program: p });
    }
  }

  // ─── Rebate vendor depts (~400) ──────────────────────────────────────
  // 2-3 depts per rebate_vendor, picked from full DEPARTMENTS list
  console.log('› rebate vendor depts');
  type SeededVendorDept = {
    id: string;
    rebateVendorId: string;
    vendorId: string;
    departmentCode: string;
    program: SeededProgram;
  };
  const seededVendorDepts: SeededVendorDept[] = [];

  for (const rv of seededRebateVendors) {
    const deptCount = intBetween(2, 3);
    const usedDepts = new Set<string>();
    let attempts = 0;
    while (usedDepts.size < deptCount && attempts++ < 20) {
      const d = pick(DEPARTMENTS);
      if (usedDepts.has(d.code)) continue;
      usedDepts.add(d.code);
      const rvd = await prisma.rebateVendorDept.create({
        data: {
          rebateVendorId: rv.id,
          departmentCode: d.code,
          departmentName: d.name,
        },
      });
      seededVendorDepts.push({
        id: rvd.id,
        rebateVendorId: rv.id,
        vendorId: rv.vendorId,
        departmentCode: d.code,
        program: rv.program,
      });
    }
  }

  // ─── Calculate results (~2000) ────────────────────────────────────────
  console.log('› calculate results');

  const redVendorIdsWithOpenP04 = new Set(redVendors.slice(0, 2).map((v) => v.id));
  const amberVendorIdsWithUnfinalizedP04 = new Set(amberVendors.slice(8, 9).map((v) => v.id));

  for (const rvd of seededVendorDepts) {
    for (const fp of FISCAL_PERIODS) {
      const receiptAmount = decBetween(50_000, 2_000_000);
      const tierLevel = intBetween(1, 3);
      const rateApplied = Number((0.015 + 0.005 * (tierLevel - 1) + rng() * 0.003).toFixed(6));
      const pmu = Number((receiptAmount * rateApplied).toFixed(2));
      const margin = decBetween(0, pmu * 0.2);
      const advcoop = decBetween(0, pmu * 0.1);
      const otherCoop = decBetween(0, pmu * 0.05);
      const total = Number((pmu + margin + advcoop + otherCoop).toFixed(2));
      const adjustment = rng() < 0.05 ? decBetween(-5000, 5000) : 0;
      const final = Number((total + adjustment).toFixed(2));

      let status: CalculateResultStatus;
      if (fp.fiscalPeriod <= 3) {
        status = CalculateResultStatus.FINALIZED;
      } else if (fp.fiscalPeriod === 4) {
        if (redVendorIdsWithOpenP04.has(rvd.vendorId)) {
          status = CalculateResultStatus.OPEN;
        } else if (amberVendorIdsWithUnfinalizedP04.has(rvd.vendorId)) {
          status = pick([CalculateResultStatus.PENDING_REVIEW, CalculateResultStatus.APPROVED]);
        } else {
          status = CalculateResultStatus.FINALIZED;
        }
      } else {
        status = pick([
          CalculateResultStatus.OPEN,
          CalculateResultStatus.PENDING_REVIEW,
          CalculateResultStatus.REVIEWED,
          CalculateResultStatus.APPROVED,
        ]);
      }

      const isFinalizedOrLater = status === CalculateResultStatus.FINALIZED;
      const periodEnd = new Date(fp.periodEnd);

      await prisma.calculateResult.create({
        data: {
          rebateVendorDeptId: rvd.id,
          fiscalPeriod: fp.fiscalPeriod,
          fiscalYear: fp.fiscalYear,
          receiptAmount,
          tierLevel,
          rateApplied,
          pmuEarnings: pmu,
          marginEarnings: margin,
          advcoopEarnings: advcoop,
          otherCoopEarnings: otherCoop,
          totalEarnings: total,
          adjustmentAmount: adjustment,
          finalEarnings: final,
          status,
          runAt: status === CalculateResultStatus.OPEN ? null : new Date(periodEnd.getTime() + 86400000),
          reviewedAt:
            status === CalculateResultStatus.OPEN || status === CalculateResultStatus.PENDING_REVIEW
              ? null
              : new Date(periodEnd.getTime() + 2 * 86400000),
          reviewedBy:
            status === CalculateResultStatus.OPEN || status === CalculateResultStatus.PENDING_REVIEW
              ? null
              : apAnalyst.id,
          approvedAt: [
            CalculateResultStatus.APPROVED,
            CalculateResultStatus.FINALIZED,
          ].includes(status)
            ? new Date(periodEnd.getTime() + 3 * 86400000)
            : null,
          approvedBy: [
            CalculateResultStatus.APPROVED,
            CalculateResultStatus.FINALIZED,
          ].includes(status)
            ? apManager.id
            : null,
          finalizedAt: isFinalizedOrLater ? new Date(periodEnd.getTime() + 4 * 86400000) : null,
        },
      });
    }
  }

  // ─── acct_control_master ──────────────────────────────────────────────
  console.log('› acct_control_master');
  const ACM_REBATE_TYPES = ['R-COTRKT', 'S-NSA', 'N-ADVCOOP', 'S-SCNBK'];
  const ACM_FUNCTIONS: FunctionType[] = [FunctionType.ACCRUAL, FunctionType.RECLASS, FunctionType.DEDUCTION];
  const ACM_TARGETS: TargetSystem[] = [TargetSystem.RSL, TargetSystem.AP, TargetSystem.GL];
  const acmEntries: { rebateTypeCode: string; functionType: FunctionType; targetSystem: TargetSystem; accountCode: string; costCenter: string; transactionTypeCode: string; description: string }[] = [];
  let acmIdx = 0;
  for (const rtCode of ACM_REBATE_TYPES) {
    for (const fn of ACM_FUNCTIONS) {
      for (const ts of ACM_TARGETS) {
        if (fn === FunctionType.DEDUCTION && ts === TargetSystem.GL) continue;
        if (fn === FunctionType.RECLASS && ts === TargetSystem.AP) continue;
        acmEntries.push({
          rebateTypeCode: rtCode,
          functionType: fn,
          targetSystem: ts,
          accountCode: `ACCT-${String(50000 + acmIdx).padStart(6, '0')}`,
          costCenter: `CC-${String(100 + (acmIdx % 12)).padStart(3, '0')}`,
          transactionTypeCode: `TXN-${fn}-${ts}`,
          description: `${rtCode} ${fn} → ${ts}`,
        });
        acmIdx++;
      }
    }
  }
  await prisma.acctControlMaster.createMany({ data: acmEntries });
  const acms = await prisma.acctControlMaster.findMany();
  const acmByKey = new Map(
    acms.map((a) => [`${a.rebateTypeCode}|${a.functionType}|${a.targetSystem}`, a]),
  );

  // ─── Batches and batch items for P04 ──────────────────────────────────
  console.log('› batches');
  const finalizedP04Calcs = await prisma.calculateResult.findMany({
    where: { fiscalPeriod: 4, fiscalYear: 2025, status: CalculateResultStatus.FINALIZED },
    take: 200,
    include: { rebateVendorDept: { include: { rebateVendor: { include: { rebateProgram: true } } } } },
  });

  for (const ts of [TargetSystem.RSL, TargetSystem.AP, TargetSystem.GL]) {
    const calcs = finalizedP04Calcs.slice(0, 40);
    if (calcs.length === 0) continue;
    const total = calcs.reduce((s, c) => s + Number(c.finalEarnings), 0);
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `BCH-2025-${String(800 + ts.charCodeAt(0)).padStart(4, '0')}`,
        targetSystem: ts,
        functionType: FunctionType.ACCRUAL,
        fiscalPeriod: 4,
        fiscalYear: 2025,
        totalAmount: Number(total.toFixed(2)),
        recordCount: calcs.length,
        createdBy: apAnalyst.id,
        exportedAt: new Date('2025-06-03'),
        exportedBy: apAnalyst.id,
        finalizedAt: new Date('2025-06-03'),
        finalizedBy: apManager.id,
      },
    });

    for (const c of calcs) {
      const rtCode = c.rebateVendorDept.rebateVendor.rebateProgram.rebateTypeCode;
      const acm =
        acmByKey.get(`${rtCode}|ACCRUAL|${ts}`) ??
        acmByKey.get(`R-COTRKT|ACCRUAL|${ts}`)!;
      await prisma.batchItem.create({
        data: {
          batchId: batch.id,
          calculateResultId: c.id,
          amount: c.finalEarnings,
          acctControlId: acm.id,
        },
      });
    }
  }

  // ─── Calculate result adjustments ─────────────────────────────────────
  console.log('› calculate_result_adjustments');
  const p03Calcs = await prisma.calculateResult.findMany({
    where: { fiscalPeriod: 3, fiscalYear: 2025, status: CalculateResultStatus.FINALIZED },
    take: 10,
  });
  for (const c of p03Calcs) {
    await prisma.calculateResultAdjustment.create({
      data: {
        calculateResultId: c.id,
        adjustmentAmount: decBetween(-2500, 2500),
        adjustmentReason: pick([
          'Receipt correction post-audit',
          'Tier reclassification',
          'Vendor dispute resolution',
          'Data correction from 1010',
        ]),
        appliedBy: apManager.id,
      },
    });
  }

  // ─── Checks, Deductions, Invoices ─────────────────────────────────────
  console.log('› checks, deductions, invoices');
  const allRVs = seededRebateVendors;

  for (let i = 0; i < 60; i++) {
    const rv = pick(allRVs);
    const isCleared = rng() < 0.7;
    await prisma.check.create({
      data: {
        rebateVendorId: rv.id,
        checkNumber: `CHK-${String(100000 + i).padStart(6, '0')}`,
        checkDate: new Date(2025, intBetween(1, 5), intBetween(1, 28)),
        amount: decBetween(5_000, 250_000),
        status: isCleared ? 'CLEARED' : 'PENDING',
        clearedAt: isCleared ? new Date(2025, intBetween(2, 5), intBetween(1, 28)) : null,
      },
    });
  }

  for (let i = 0; i < 20; i++) {
    const rv = pick(allRVs);
    await prisma.deduction.create({
      data: {
        rebateVendorId: rv.id,
        deductionNumber: `DED-${String(50000 + i).padStart(6, '0')}`,
        deductionDate: new Date(2025, intBetween(1, 5), intBetween(1, 28)),
        amount: decBetween(-15_000, -100),
        reasonCode: pick(['RETURN_CREDIT', 'PRICE_ADJUSTMENT', 'DATA_CORRECTION']),
      },
    });
  }

  const overdueRvForRed = (await prisma.rebateVendor.findMany({
    where: { vendorId: { in: redVendors.slice(2, 3).map((v) => v.id) } },
    take: 1,
  }))[0];
  const overdueRvForAmber = (await prisma.rebateVendor.findMany({
    where: { vendorId: { in: amberVendors.slice(9, 10).map((v) => v.id) } },
    take: 1,
  }))[0];

  let invoiceIdx = 0;
  for (const fp of FISCAL_PERIODS) {
    if (fp.fiscalPeriod === 5) continue;
    for (let i = 0; i < 75; i++) {
      const rv = pick(allRVs);
      await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-2025-${String(invoiceIdx++).padStart(5, '0')}`,
          rebateVendorId: rv.id,
          invoiceType: pick(['ACCRUAL', 'DEDUCTION']),
          fiscalPeriod: fp.fiscalPeriod,
          fiscalYear: fp.fiscalYear,
          amount: decBetween(1_000, 100_000),
          sentAt: new Date(fp.periodEnd),
          dueDate: new Date(new Date(fp.periodEnd).getTime() + 30 * 86400000),
          paidAt: new Date(new Date(fp.periodEnd).getTime() + 25 * 86400000),
          status: 'PAID',
        },
      });
    }
  }
  if (overdueRvForRed) {
    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-2025-OVERDUE-RED`,
        rebateVendorId: overdueRvForRed.id,
        invoiceType: 'ACCRUAL',
        fiscalPeriod: 2,
        fiscalYear: 2025,
        amount: 47500,
        sentAt: new Date('2025-03-30'),
        dueDate: new Date('2025-04-29'),
        status: 'OVERDUE',
      },
    });
  }
  if (overdueRvForAmber) {
    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-2025-OVERDUE-AMBER`,
        rebateVendorId: overdueRvForAmber.id,
        invoiceType: 'ACCRUAL',
        fiscalPeriod: 4,
        fiscalYear: 2025,
        amount: 23000,
        sentAt: new Date('2025-06-01'),
        dueDate: new Date('2025-07-01'),
        status: 'OVERDUE',
      },
    });
  }

  // ─── Analytics summaries ──────────────────────────────────────────────
  console.log('› analytics summaries');
  const tierAlertVendorIds = new Set(amberVendors.slice(8, 9).map((v) => v.id));
  const anomalyVendorIds = new Set(redVendors.slice(2, 4).map((v) => v.id));

  const summaryKeys = new Map<string, { vendorId: string; departmentCode: string }>();
  for (const rvd of seededVendorDepts) {
    summaryKeys.set(`${rvd.vendorId}|${rvd.departmentCode}`, {
      vendorId: rvd.vendorId,
      departmentCode: rvd.departmentCode,
    });
  }
  for (const { vendorId, departmentCode } of summaryKeys.values()) {
    for (const fp of [FISCAL_PERIODS[3]!, FISCAL_PERIODS[4]!]) {
      const transactionVolume = decBetween(100_000, 5_000_000);
      const transactionVolumePy = Number((transactionVolume * (0.85 + rng() * 0.30)).toFixed(2));
      const yoy = Number(((transactionVolume - transactionVolumePy) / transactionVolumePy).toFixed(4));
      const tier = intBetween(1, 3);
      const isTierAlert = tierAlertVendorIds.has(vendorId) && rng() < 0.5;
      const isAnomaly = anomalyVendorIds.has(vendorId) && rng() < 0.3;
      await prisma.analyticsSummary.create({
        data: {
          vendorId,
          departmentCode,
          source: pick([Source.R, Source.S, Source.D]),
          fiscalPeriod: fp.fiscalPeriod,
          fiscalYear: fp.fiscalYear,
          transactionVolume,
          transactionVolumePy,
          yoyVariancePct: yoy,
          currentTier: tier,
          tierThresholdNext: tier < 3 ? decBetween(transactionVolume * 1.05, transactionVolume * 1.5) : null,
          paceToTargetPct: Number((0.7 + rng() * 0.4).toFixed(4)),
          tierAlert: isTierAlert,
          anomalyFlag: isAnomaly,
          anomalyReason: isAnomaly ? 'Volume spike vs prior 90-day baseline' : null,
        },
      });
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────
  console.log('› notifications');
  for (const u of users) {
    if (u.role === UserRole.READ_ONLY) continue;
    for (let i = 0; i < 15; i++) {
      const isUnread = rng() < 0.3;
      const type = pick([
        NotificationType.REPORT_COMPLETE,
        NotificationType.REPORT_FAILED,
        NotificationType.QUEUE_PENDING,
        NotificationType.AGREEMENT_APPROVED,
        NotificationType.AGREEMENT_REJECTED,
        NotificationType.PERIOD_CLOSED,
        NotificationType.TIER_ALERT,
        NotificationType.ANOMALY_FLAG,
      ]);
      await prisma.notification.create({
        data: {
          userId: u.id,
          type,
          payload: {
            message: `Sample ${type} notification`,
            seedDemo: true,
          },
          readAt: isUnread ? null : new Date(2025, intBetween(4, 5), intBetween(1, 28)),
          createdAt: new Date(2025, intBetween(4, 5), intBetween(1, 28)),
        },
      });
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  const counts = {
    fiscalPeriods: await prisma.fiscalPeriod.count(),
    programTypes: await prisma.programType.count(),
    rebateTypes: await prisma.rebateType.count(),
    users: await prisma.user.count(),
    vendors: await prisma.vendor.count(),
    agreements: await prisma.agreement.count(),
    rebatePrograms: await prisma.rebateProgram.count(),
    rebateTiers: await prisma.rebateTier.count(),
    rebateVendors: await prisma.rebateVendor.count(),
    rebateVendorDepts: await prisma.rebateVendorDept.count(),
    calculateResults: await prisma.calculateResult.count(),
    calcAdjustments: await prisma.calculateResultAdjustment.count(),
    acctControlMaster: await prisma.acctControlMaster.count(),
    batches: await prisma.batch.count(),
    batchItems: await prisma.batchItem.count(),
    checks: await prisma.check.count(),
    deductions: await prisma.deduction.count(),
    invoices: await prisma.invoice.count(),
    analyticsSummaries: await prisma.analyticsSummary.count(),
    notifications: await prisma.notification.count(),
  };

  console.log('\n✓ seed complete');
  console.table(counts);
}

main()
  .catch((e) => {
    console.error('seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
