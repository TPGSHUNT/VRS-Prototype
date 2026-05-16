// VRS prototype seed script
// Runs against local Postgres. Idempotent — wipes data first.
// Counts/distribution follow docs/04 §3-4; Phase 0 (docs/20) reworked:
//   - 12-period / 4-5-4 fiscal calendar (P01–P11 closed, P12 open)  [P0.1]
//   - earnings normalized positive + finalEarningsLegacy = legacy negative [P0.2]
//   - Vendor.apNumber/ipNumber, RebateVendorDept.ipVendorNum            [P0.3]
//   - sequence-shaped agmtId                                            [P0.4]
//   - RebateProgram extract date pair                                   [P0.5]
//   - real DMM/GMM approval thresholds, readable Frequency domain       [P0.6]
//
// Still synthetic single-year FY2025. Real multi-year ingest is Phase 3.
// Known-not-modeled (deliberate, see docs/16/19): Category bloat (~2,029 real),
// the real 10-transaction-per-AcctType AcctControlMaster structure.

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

// Department codes — placeholder until Ken provides full list (request item A.1).
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

// RebateType compound codes — Source-MerchType bridge per schema docs.
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

// ─── Real identities (committed fixture, extracted from Ken's data on the
// P: share — RebateProgramExtact / UnapprovedExtract / VRS_Vendors). The seed
// depends on the fixture, NOT the share, so the demo box stays buildable.
// Provenance + rationale: memory project_no_login_seat_switcher / docs/20.
import { readFileSync } from 'node:fs';

interface RealIdentities {
  apUsers: { userid: string; weight: number }[];
  buyers: string[];
  dmms: string[];
  svps: string[];
  vendorMdse: Record<string, { buyer: string; dmm: string; svp: string }>;
  vendorEarnings2025: Record<string, number>;
}
const REAL: RealIdentities = JSON.parse(
  readFileSync(new URL('./fixtures/real-identities.json', import.meta.url), 'utf-8'),
);

// kbanks = Ken Banks (TPG author/consultant, not a DG operator seat);
// "load est" = a load process. Neither is a DG persona — filter them.
const NOT_DG_PERSONA = new Set(['kbanks', 'load est']);

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

// Deterministic unique short codes (schema @@unique on analystCode/email).
const usedCodes = new Set<string>();
const usedEmails = new Set<string>();
function mkCode(seedStr: string): string {
  const base = seedStr.replace(/[^a-zA-Z]/g, '').toUpperCase();
  let c = (base.slice(0, 2) || 'XX');
  let n = 1;
  while (usedCodes.has(c)) c = (base.slice(0, 1) || 'X') + (n++);
  usedCodes.add(c);
  return c;
}
function mkEmail(local: string): string {
  let e = `${local}@dollargeneral.com`;
  let n = 1;
  while (usedEmails.has(e)) e = `${local}${n++}@dollargeneral.com`;
  usedEmails.add(e);
  return e;
}

type SeedUser = { email: string; name: string; analystCode: string; role: UserRole };
const USERS: SeedUser[] = [];

// AP side — real userids from RebateProgramExtact, by program-create volume.
// Ken (corroborated by docs/17 image062 security export): only Lane & Amy
// (lscoggin, areidl) hold VRS_ADMIN → estate/manager tier; the rest analysts.
const apReal = REAL.apUsers.filter((u) => !NOT_DG_PERSONA.has(u.userid));
const AP_MANAGER_IDS = new Set(['lscoggin', 'areidl']);
for (const u of apReal) {
  USERS.push({
    email: mkEmail(u.userid),
    name: u.userid, // the real VRS login handle — what the system records
    analystCode: mkCode(u.userid),
    role: AP_MANAGER_IDS.has(u.userid) ? UserRole.AP_MANAGER : UserRole.AP_ANALYST,
  });
}

// MDSE side — real Buyers / DMMs / SVPs from UnapprovedExtract.
const buyersReal = REAL.buyers.filter((b) => !NOT_DG_PERSONA.has(b)).slice(0, 8);
buyersReal.forEach((b, i) => {
  USERS.push({
    email: mkEmail(slug(b)),
    name: b,
    analystCode: mkCode(b),
    // Last one is the delegate seat (UnapprovedExtract shows "(Delegate)"
    // statuses but no delegate-name column — designate one real buyer).
    role: i === buyersReal.length - 1 ? UserRole.BUYER_DELEGATE : UserRole.BUYER,
  });
});
for (const d of REAL.dmms.slice(0, 6)) {
  USERS.push({ email: mkEmail(slug(d)), name: d, analystCode: mkCode(d), role: UserRole.DMM });
}
// Prototype UserRole has no SVP. SVP is the real above-DMM escalation tier
// (Ken), so it fills the GMM "further escalation" slot — real names, modeled.
for (const s of REAL.svps.filter(Boolean).slice(0, 3)) {
  USERS.push({ email: mkEmail(slug(s)), name: s, analystCode: mkCode(s), role: UserRole.GMM });
}
// Generic finance/audit seat (no real read-only identity in the data; a role,
// not a person — not a misrepresentation).
USERS.push({
  email: mkEmail('audit'),
  name: 'Finance / Audit (read-only)',
  analystCode: mkCode('EX'),
  role: UserRole.READ_ONLY,
});

// ─── Fiscal calendar — 12 periods, 4-5-4 (Ken round 3) ──────────────────────
// FY2025 anchored at 2025-02-02 (DG fiscal-year start convention). Week pattern
// per quarter: 4-5-4 (P3/P6/P9/P12 are quarter-ends). 52 weeks total.
// P01–P11 closed, P12 open (demo "current period" for the period-close story).
const PERIOD_WEEKS = [4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4];
const FY = 2025;
const OPEN_PERIOD = 12; // the single open period
const LAST_CLOSED_PERIOD = 11; // most-recently-closed = bubble-health reference

const FISCAL_PERIODS = (() => {
  const out: Array<{
    fiscalPeriod: number;
    fiscalYear: number;
    periodStart: string;
    periodEnd: string;
    isClosed: boolean;
  }> = [];
  let cursor = new Date(Date.UTC(2025, 1, 2)); // 2025-02-02
  for (let p = 1; p <= 12; p++) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + PERIOD_WEEKS[p - 1]! * 7 - 1);
    out.push({
      fiscalPeriod: p,
      fiscalYear: FY,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      isClosed: p <= LAST_CLOSED_PERIOD,
    });
    cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
})();
const CLOSED_PERIODS = FISCAL_PERIODS.filter((f) => f.isClosed);

// Approval thresholds — real Parameter values (Ken_answers_4_may12.txt / docs/17).
// Forecast (here: estimatedValue) ≥ $250K routes through DMM; ≥ $1M then GMM.
const DMM_THRESHOLD = 250_000;
const GMM_THRESHOLD = 1_000_000;
// DMM_APPROVE_TPR = No — TPR agreements do NOT force DMM purely for being TPR
// (parameter-disabled, Ken round 3). No special handling needed; documented.

// Pay Type codes — values from extract; meanings TBD with Ken (K5).
const PAY_TYPES = ['C', 'D', 'G', 'M', 'T', 'W'];
// Frequency — readable domain from the legacy form dropdown (docs/17 image087).
// Exact stored codes pending K5; using labels for demo legibility, weighted to Period.
const FREQUENCIES = ['Period', 'Period', 'Period', 'Quarter', 'End of Rebate', 'Weekly'];
const EARN_TYPES = ['M'];
const SBT_TYPES = ['N'];

// Sequence-shaped Agmt ID (Oracle sequence, not 1..N) — P0.4
let agmtSeq = intBetween(300_000, 380_000);
const nextAgmtId = () => (agmtSeq += intBetween(1, 40));

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
  console.log(`› fiscal periods (12, 4-5-4; P01–P${LAST_CLOSED_PERIOD} closed, P${OPEN_PERIOD} open)`);
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
  const byName = new Map(users.map((u) => [u.name, u]));
  const byRole = (r: UserRole) => users.filter((u) => u.role === r);

  // Representative singletons for audit fields that just need *a* valid user.
  const apManager = byRole(UserRole.AP_MANAGER)[0]!;
  const apAnalyst = byRole(UserRole.AP_ANALYST)[0]!;
  const buyer = byRole(UserRole.BUYER)[0]!;
  const buyerDelegate = byRole(UserRole.BUYER_DELEGATE)[0] ?? buyer;
  const dmm = byRole(UserRole.DMM)[0]!;
  const gmm = byRole(UserRole.GMM)[0]!;

  // AP_ANALYST → program ownership, weighted by each analyst's real
  // program-create volume (RebateProgramExtact). Makes the analyst seat-scope
  // real and uneven, like production.
  const analystPool = byRole(UserRole.AP_ANALYST);
  const analystWeights = analystPool.map(
    (u) => REAL.apUsers.find((r) => r.userid === u.name)?.weight ?? 1,
  );
  const analystCum: number[] = [];
  analystWeights.reduce((acc, w, i) => (analystCum[i] = acc + w), 0);
  const analystTotal = analystCum[analystCum.length - 1] ?? 1;
  const pickAnalyst = () => {
    const x = rng() * analystTotal;
    const i = analystCum.findIndex((c) => x < c);
    return analystPool[i === -1 ? analystPool.length - 1 : i]!;
  };

  // vendor → real Buyer / DMM / SVP(GMM) from UnapprovedExtract; round-robin
  // the real pools for vendors not present in that extract.
  const buyerPool = [...byRole(UserRole.BUYER), ...byRole(UserRole.BUYER_DELEGATE)];
  const dmmPool = byRole(UserRole.DMM);
  const gmmPool = byRole(UserRole.GMM); // real SVPs modeled as the escalation tier
  let buyerRR = 0;
  let dmmRR = 0;
  let gmmRR = 0;
  const mdseFor = (vendorName: string) =>
    REAL.vendorMdse[vendorName.trim().toUpperCase()];
  // Only accept a name-matched user if it actually holds the expected MDSE role
  // — squelches real-data noise where an extract "Buyer" string is an AP login
  // (e.g. lscoggin) that would otherwise leak across roles. Otherwise round-robin
  // the real pool so the spread reflects plausible reality, not a singleton dump.
  const inPool = (
    u: (typeof users)[number] | undefined | false,
    pool: typeof users,
  ) => (u && pool.some((p) => p.id === u.id) ? u : undefined);
  const buyerForVendor = (vendorName: string) => {
    const m = mdseFor(vendorName);
    return (
      inPool(m && byName.get(m.buyer), buyerPool) ??
      buyerPool[buyerRR++ % buyerPool.length]!
    );
  };
  const dmmForVendor = (vendorName: string) => {
    const m = mdseFor(vendorName);
    return (
      inPool(m && byName.get(m.dmm), dmmPool) ??
      dmmPool[dmmRR++ % dmmPool.length]!
    );
  };
  const gmmForVendor = (vendorName: string) => {
    const m = mdseFor(vendorName);
    return (
      inPool(m && m.svp ? byName.get(m.svp) : undefined, gmmPool) ??
      gmmPool[gmmRR++ % gmmPool.length]!
    );
  };

  // Real per-vendor 2025 earnings magnitude (VRS_Vendors) → receipt scale, so
  // big real vendors are big bubbles. Vendors absent from the file scale 1×.
  const earnAbs = Object.values(REAL.vendorEarnings2025).map(Math.abs).sort((a, b) => a - b);
  const earnMedian = earnAbs[Math.floor(earnAbs.length / 2)] || 1;
  const vendorScaleByName = (vendorName: string) => {
    const e = REAL.vendorEarnings2025[vendorName.trim().toUpperCase()];
    if (e == null) return 1;
    return Math.min(12, Math.max(0.2, Math.abs(e) / earnMedian));
  };

  // Vendors — vendorNumber (legacy Int alias) + apNumber (VARCHAR9) + ipNumber (NUMBER5)
  console.log('› vendors');
  const vendorIp = new Map<string, number>();
  const vendors = await Promise.all(
    VENDOR_NAMES.map(async (name, i) => {
      const vendorNumber = 1000 + i * 6427 + intBetween(0, 50); // spread, sequence-ish
      const ipNumber = intBetween(10_000, 99_999); // NUMBER(5)
      const v = await prisma.vendor.create({
        data: {
          vendorNumber,
          apNumber: String(vendorNumber).padStart(9, '0'), // VARCHAR(9) digits-only
          ipNumber,
          name,
        },
      });
      vendorIp.set(v.id, ipNumber);
      return v;
    }),
  );
  const largeVendors = vendors.slice(0, 5);
  const midVendors = vendors.slice(5, 20);
  const smallVendors = vendors.slice(20);
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));

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

  // Real approval-chain audit consistent with estimatedValue vs thresholds.
  const chainFor = (estimatedValue: number, vendorName: string) => {
    const throughDmm = estimatedValue >= DMM_THRESHOLD;
    const throughGmm = estimatedValue >= GMM_THRESHOLD;
    return {
      dmmApprovedBy: throughDmm ? dmmForVendor(vendorName).id : null,
      dmmApprovedAt: throughDmm ? new Date('2024-12-10') : null,
      gmmApprovedBy: throughGmm ? gmmForVendor(vendorName).id : null,
      gmmApprovedAt: throughGmm ? new Date('2024-12-15') : null,
    };
  };

  // 8 PENDING_AP_APPROVAL — drives the bubble pulsing rings
  for (const v of queuePendingVendors) {
    const rt = randomRebateType();
    const pt = randomProgramType();
    const estimatedValue = decBetween(50_000, 2_500_000);
    const chain = chainFor(estimatedValue, v.name);
    const a = await prisma.agreement.create({
      data: {
        agmtId: nextAgmtId(),
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `Q${intBetween(1, 4)} ${rt.merchType} program with ${v.name.split(' ').slice(0, 2).join(' ')}`,
        buyerId: buyerForVendor(v.name).id,
        programTypeId: pt.id,
        estimatedValue,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2026-05-31'),
        status: AgreementStatus.PENDING_AP_APPROVAL,
        dmmApprovedBy: chain.dmmApprovedBy,
        dmmApprovedAt: chain.dmmApprovedAt,
        gmmApprovedBy: chain.gmmApprovedBy,
        gmmApprovedAt: chain.gmmApprovedAt,
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

  // 1 demo agreement at PENDING_GMM_APPROVAL — full chain demo ($4.75M ≥ GMM)
  {
    const v = greenVendors[0]!;
    const rt = REBATE_TYPES.find((x) => x.code === 'R-COTRKT')!;
    const pt = programTypeByCode.get('ADV_COOP')!;
    const a = await prisma.agreement.create({
      data: {
        agmtId: nextAgmtId(),
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: 'AGR-DEMO-001 — full chain demo (HBA tier renegotiation)',
        buyerId: buyerForVendor(v.name).id,
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
    const estimatedValue = decBetween(25_000, 8_000_000);
    const chain = chainFor(estimatedValue, v.name);
    const a = await prisma.agreement.create({
      data: {
        agmtId: nextAgmtId(),
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `${rt.merchType} program for ${v.name.split(' ')[0]}`,
        buyerId: buyerForVendor(v.name).id,
        programTypeId: pt.id,
        estimatedValue,
        startDate: new Date('2025-02-02'),
        endDate: new Date('2026-01-31'),
        status: AgreementStatus.ASSIGNED,
        dmmApprovedBy: chain.dmmApprovedBy,
        dmmApprovedAt: chain.dmmApprovedAt,
        gmmApprovedBy: chain.gmmApprovedBy,
        gmmApprovedAt: chain.gmmApprovedAt,
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
        agmtId: nextAgmtId(),
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `Draft: ${rt.merchType} for ${v.name.split(' ')[0]}`,
        buyerId: buyerForVendor(v.name).id,
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
        agmtId: nextAgmtId(),
        vendorId: v.id,
        merchType: rt.merchType,
        source: rt.source,
        description: `${status} agreement`,
        buyerId: buyerForVendor(v.name).id,
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

  // Sequence-shaped programNumber (Oracle NUMBER(10), not 1..N) — P0.4
  let programNumberSeq = intBetween(5_000, 9_000);
  // Extract range starts ~5 weeks before the Rebate range (K2): so PMU + Margin
  // both compute in period 1. Rebate range = startDate/endDate below.
  const rebateStart = new Date('2025-02-02');
  const rebateEnd = new Date('2026-01-31');
  const extractBegin = new Date(rebateStart.getTime() - 35 * 86_400_000);
  const extractEnd = rebateEnd;

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
        analystId: pickAnalyst().id,
        agreementId: ag.id,
        startDate: rebateStart,
        endDate: rebateEnd,
        extractBeginDate: extractBegin,
        extractEndDate: extractEnd,
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
        analystId: pickAnalyst().id,
        startDate: rebateStart,
        endDate: rebateEnd,
        extractBeginDate: extractBegin,
        extractEndDate: extractEnd,
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
    // Per Ken: NSA programs have NO tiers (own subsystem).
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
          ipVendorNum: vendorIp.get(rv.vendorId) ?? null, // MDSE-side IP at dept grain
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

  // ─── Calculate results (12 periods × depts) ───────────────────────────
  console.log('› calculate results');

  // RED/AMBER demo fates land on the most-recently-closed period (P11).
  const redVendorIdsWithOpenClosed = new Set(redVendors.slice(0, 2).map((v) => v.id));
  const amberVendorIdsWithUnfinalizedClosed = new Set(amberVendors.slice(8, 9).map((v) => v.id));

  for (const rvd of seededVendorDepts) {
    for (const fp of FISCAL_PERIODS) {
      const receiptAmount = Number(
        (
          decBetween(50_000, 2_000_000) *
          vendorScaleByName(vendorNameById.get(rvd.vendorId) ?? '')
        ).toFixed(2),
      );
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
      if (fp.fiscalPeriod < LAST_CLOSED_PERIOD) {
        status = CalculateResultStatus.FINALIZED;
      } else if (fp.fiscalPeriod === LAST_CLOSED_PERIOD) {
        if (redVendorIdsWithOpenClosed.has(rvd.vendorId)) {
          status = CalculateResultStatus.OPEN; // E&C never run before close → RED
        } else if (amberVendorIdsWithUnfinalizedClosed.has(rvd.vendorId)) {
          status = pick([CalculateResultStatus.PENDING_REVIEW, CalculateResultStatus.APPROVED]);
        } else {
          status = CalculateResultStatus.FINALIZED;
        }
      } else {
        // The open period (P12) — normal mix, does not color the bubble.
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
          finalEarnings: final, // normalized positive = value to DG
          // Legacy/source convention is negative (vendor owes DG). Synthetic
          // shadow so the "Accounting view" drill has real data pre-ingest.
          finalEarningsLegacy: Number((-final).toFixed(2)),
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
  // NOTE: the real structure is a fixed 10-transaction set PER Acct Type
  // (PMU/Margin/AdvCoop/OtherCoop × Reclass/Accrual + Deductions/Checks →
  // RSL/GL/AP — docs/17 image067). Our model keys on
  // (rebateTypeCode, functionType, targetSystem) and cannot represent the
  // component (PMU vs Margin) dimension, so the real 10-row shape is a
  // deliberate POST-P0 schema item (docs/16). Seed keeps the combinatorial
  // approximation with realistic-looking codes.
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

  // ─── Batches and batch items for the last closed period ───────────────
  console.log('› batches');
  const finalizedClosedCalcs = await prisma.calculateResult.findMany({
    where: { fiscalPeriod: LAST_CLOSED_PERIOD, fiscalYear: FY, status: CalculateResultStatus.FINALIZED },
    take: 200,
    include: { rebateVendorDept: { include: { rebateVendor: { include: { rebateProgram: true } } } } },
  });

  for (const ts of [TargetSystem.RSL, TargetSystem.AP, TargetSystem.GL]) {
    const calcs = finalizedClosedCalcs.slice(0, 40);
    if (calcs.length === 0) continue;
    const total = calcs.reduce((s, c) => s + Number(c.finalEarnings), 0);
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `BCH-${FY}-${String(800 + ts.charCodeAt(0)).padStart(4, '0')}`,
        targetSystem: ts,
        functionType: FunctionType.ACCRUAL,
        fiscalPeriod: LAST_CLOSED_PERIOD,
        fiscalYear: FY,
        totalAmount: Number(total.toFixed(2)),
        recordCount: calcs.length,
        createdBy: apAnalyst.id,
        exportedAt: new Date('2025-12-10'),
        exportedBy: apAnalyst.id,
        finalizedAt: new Date('2025-12-10'),
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

  // ─── Calculate result adjustments (on an earlier finalized period) ────
  console.log('› calculate_result_adjustments');
  const adjPeriod = Math.max(1, LAST_CLOSED_PERIOD - 8); // ~P03
  const adjCalcs = await prisma.calculateResult.findMany({
    where: { fiscalPeriod: adjPeriod, fiscalYear: FY, status: CalculateResultStatus.FINALIZED },
    take: 10,
  });
  for (const c of adjCalcs) {
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
        checkDate: new Date(2025, intBetween(1, 11), intBetween(1, 28)),
        amount: decBetween(5_000, 250_000),
        status: isCleared ? 'CLEARED' : 'PENDING',
        clearedAt: isCleared ? new Date(2025, intBetween(2, 11), intBetween(1, 28)) : null,
      },
    });
  }

  for (let i = 0; i < 20; i++) {
    const rv = pick(allRVs);
    await prisma.deduction.create({
      data: {
        rebateVendorId: rv.id,
        deductionNumber: `DED-${String(50000 + i).padStart(6, '0')}`,
        deductionDate: new Date(2025, intBetween(1, 11), intBetween(1, 28)),
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
  for (const fp of CLOSED_PERIODS) {
    for (let i = 0; i < 30; i++) {
      const rv = pick(allRVs);
      await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${FY}-${String(invoiceIdx++).padStart(5, '0')}`,
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
        invoiceNumber: `INV-${FY}-OVERDUE-RED`,
        rebateVendorId: overdueRvForRed.id,
        invoiceType: 'ACCRUAL',
        fiscalPeriod: 2,
        fiscalYear: FY,
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
        invoiceNumber: `INV-${FY}-OVERDUE-AMBER`,
        rebateVendorId: overdueRvForAmber.id,
        invoiceType: 'ACCRUAL',
        fiscalPeriod: LAST_CLOSED_PERIOD,
        fiscalYear: FY,
        amount: 23000,
        sentAt: new Date('2025-12-01'),
        dueDate: new Date('2026-01-01'),
        status: 'OVERDUE',
      },
    });
  }

  // ─── Analytics summaries (last-closed + open period) ──────────────────
  console.log('› analytics summaries');
  const tierAlertVendorIds = new Set(amberVendors.slice(8, 9).map((v) => v.id));
  const anomalyVendorIds = new Set(redVendors.slice(2, 4).map((v) => v.id));

  const closedFp = FISCAL_PERIODS[LAST_CLOSED_PERIOD - 1]!;
  const openFp = FISCAL_PERIODS[OPEN_PERIOD - 1]!;

  const summaryKeys = new Map<string, { vendorId: string; departmentCode: string }>();
  for (const rvd of seededVendorDepts) {
    summaryKeys.set(`${rvd.vendorId}|${rvd.departmentCode}`, {
      vendorId: rvd.vendorId,
      departmentCode: rvd.departmentCode,
    });
  }
  for (const { vendorId, departmentCode } of summaryKeys.values()) {
    for (const fp of [closedFp, openFp]) {
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
          readAt: isUnread ? null : new Date(2025, intBetween(9, 11), intBetween(1, 28)),
          createdAt: new Date(2025, intBetween(9, 11), intBetween(1, 28)),
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
