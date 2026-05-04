# VRS Schema Clarifications & Remaining Models
## Addendum to VRS_Schema_Reference.md — resolves all open issues
### TPG Partners · April 2026

---

## Resolutions to Raised Issues

---

### Issue 1 — acct_control_master.rebateType: compound code or bare MerchType?

**Decision: key off `rebate_types.code` which is a compound string in the form `SOURCE-MERCHTYPE`.**

Examples: `R-COTRKT`, `S-NSA`, `N-ADVCOOP`, `D-SCAN`.

The seed guidance in §9 was wrong to say "COTRKT × ACCRUAL/RECLASS". Correct seed guidance:
cover `R-COTRKT`, `S-NSA`, `N-ADVCOOP`, `D-SCAN` × `ACCRUAL/RECLASS/DEDUCTION` × `RSL/AP/GL` —
approximately 20–30 rows covers the common combinations.

`acct_control_master.rebateType` is a `String` FK to `rebate_types.code`. Not an enum. Not a bare MerchType.

---

### Issue 2 — ADJUSTED status: in-place mutation or separate audit table?

**Decision: separate `calculate_result_adjustments` audit table. Do not mutate a FINALIZED row.**

Rationale: FINALIZED rows in a closed FiscalPeriod are financial records. Mutating them in place destroys
the audit trail. Instead:

- `calculate_results.status` stays `FINALIZED` permanently once set.
- `ADJUSTED` is not a status on `calculate_results` — remove it from `CalculateResultStatus`.
- Adjustments are recorded in a new `calculate_result_adjustments` table (see model below).
- The UI shows `FINALIZED + adjustment` as a composite view — the base record plus any adjustment rows.

```prisma
enum CalculateResultStatus {
  OPEN
  PENDING_REVIEW
  REVIEWED
  APPROVED
  FINALIZED
  // ADJUSTED removed — see calculate_result_adjustments table
}

model CalculateResultAdjustment {
  id                  String         @id @default(uuid())
  calculateResultId   String
  calculateResult     CalculateResult @relation(fields: [calculateResultId], references: [id])
  adjustmentAmount    Decimal        @db.Decimal(15, 2)  // positive or negative
  adjustmentReason    String
  appliedBy           String         // user ID
  appliedAt           DateTime       @default(now())
  batchId             String?        // if this adjustment was included in a subsequent batch
}
```

This means `calculate_results.adjustmentAmount` and `calculate_results.adjustmentReason` on the base model
become redundant for post-finalization adjustments. Keep them for pre-finalization analyst adjustments
(applied before APPROVED status). Post-finalization adjustments always go to the audit table.

---

### Issue 3 — VENDOR_PORTAL in UserRole: consolidate or separate?

**Decision: remove `VENDOR_PORTAL` from `UserRole`. Keep `vendor_portal_users` as a separate table.**

Rationale: portal users are a fundamentally different auth population — external, vendor-facing, no access
to the main VRS application. Mixing them into the internal `users` table creates permission surface area
that doesn't exist if they're fully separated.

```prisma
// Remove VENDOR_PORTAL from UserRole enum:
enum UserRole {
  AP_ANALYST
  AP_MANAGER
  BUYER
  BUYER_DELEGATE
  DMM
  GMM
  READ_ONLY
}

// Portal users are entirely separate:
model VendorPortalUser {
  id           String    @id @default(uuid())
  vendorId     String
  vendor       Vendor    @relation(fields: [vendorId], references: [id])
  email        String    @unique
  name         String
  active       Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

NextAuth handles both populations via separate providers:
- Internal users: credentials provider against `users` table (prototype) → Azure AD SAML (production)
- Portal users: credentials provider against `vendor_portal_users` table → separate subdomain

---

### Issue 4 — Bubble health rule paints the demo red

**Decision: the OPEN/late-run check applies to the most recently CLOSED period, not the current open period.**

Revised bubble health rules:

```
GREEN:
  - All calculate_results for the most recently CLOSED period are FINALIZED
  - No anomaly_flag on analytics_summaries
  - No agreements at PENDING_AP_APPROVAL (queuePending = false)

AMBER (any one of):
  - Any calculate_result for the most recently CLOSED period is not yet FINALIZED
  - Any calculate_result for the current OPEN period is PENDING_REVIEW or REVIEWED
    (i.e., E&C has run but analyst hasn't acted — actionable but not urgent)
  - A tier_alert exists on any analytics_summaries row for this vendor
  - queuePending = true (agreement awaiting AP action)
  - Any invoice is outstanding and > 30 days past due date

RED (any one of):
  - Any calculate_result for the most recently CLOSED period is still OPEN
    (E&C was never run before period closed — this is a genuine problem)
  - Any anomaly_flag is set on analytics_summaries
  - Any invoice is outstanding and > 60 days past due date

The current OPEN period's OPEN calculations are NORMAL and do not color the bubble.
E&C for an open period is expected to run during that period, not on day 1.
```

**Seed implication:** P04 is the most recently closed period. Seed P04 calculate_results as mostly
FINALIZED (green vendors) with a handful of exceptions to show amber and red. P05 can be all OPEN/
PENDING_REVIEW — that is correct and expected for the demo.

---

### Issue 5 — Scope clarification

The previous document's "definitive" claim was too broad. Correct scope statement:

**VRS_Schema_Reference.md covers: all enums, the five most complex models, and all business rules.**

**The remaining 12 models are mechanical CRUD shells — specified below as stubs for Sprint 1.**
Claude Code should treat these stubs as the starting point and add fields as needed during implementation.

---

### Issue 6 — Prior-year data for yoyVariancePct

**Decision: store `transactionVolumePy` directly on `analytics_summaries` without requiring FY2024 rows.**

The nightly job (or seed script) computes `transactionVolumePy` and writes it as a denormalized value.
No FY2024 `analytics_summaries` rows are needed. The seed script should synthesize plausible FY2024
figures (e.g., current year volume ± 5–20% random variance) and write them directly to `transactionVolumePy`.

```
// Seed logic pseudocode:
transactionVolumePy = transactionVolume * (0.85 + Math.random() * 0.30)
// gives prior year between 85% and 115% of current year — realistic variance
yoyVariancePct = (transactionVolume - transactionVolumePy) / transactionVolumePy
```

---

### Issue 7 — totalEarnings and finalEarnings as derived columns

**Decision: use PostgreSQL generated columns for production-safety. Fine to use service-layer compute in prototype.**

For the prototype: service layer computes and writes these on every save. This is acceptable.

For production migration, add:
```sql
-- totalEarnings as a generated column (PostgreSQL 12+)
ALTER TABLE calculate_results
  ADD COLUMN total_earnings_gen NUMERIC(15,2)
  GENERATED ALWAYS AS (pmu_earnings + margin_earnings + advcoop_earnings + other_coop_earnings) STORED;
```

Not a Sprint 1 blocker. Flag for production hardening phase.

---

### Issue 8 — rebate_types table not modeled

See stub below in Section 2. This resolves Issue 1 simultaneously — `rebate_types.code` is the FK target
for `acct_control_master.rebateType`.

---

## 2. Remaining Model Stubs

These are the 12 models not fully specified in VRS_Schema_Reference.md.
Add fields as needed during implementation — these cover the required minimum.

---

```prisma
// ─── VENDORS ──────────────────────────────────────────────────────────────────

model Vendor {
  id                String              @id @default(uuid())
  vendorNumber      String              @unique  // DG vendor number e.g. "VND-10042"
  name              String
  active            Boolean             @default(true)

  // Relations
  rebateVendors     RebateVendor[]
  agreements        Agreement[]
  analyticsSummaries AnalyticsSummary[]
  portalUsers       VendorPortalUser[]

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
}

// ─── REBATE TYPES ─────────────────────────────────────────────────────────────
// The Source × MerchType intermediary. Codes are compound: e.g. R-COTRKT, S-NSA.
// This is the linchpin for acct_control_master.rebateType.

model RebateType {
  code              String    @id  // e.g. "R-COTRKT" — this is the FK target
  source            Source
  merchType         MerchType
  description       String
  usedByMdse        Boolean   @default(true)   // visible on MDSE agreement creation
  active            Boolean   @default(true)

  // Relations
  rebatePrograms    RebateProgram[]
  acctControls      AcctControlMaster[]
}

// ─── REBATE CATEGORIES ────────────────────────────────────────────────────────

model RebateCategory {
  id            String          @id @default(uuid())
  code          String          @unique  // e.g. "HBA", "GROCERY", "SEASONAL"
  name          String
  active        Boolean         @default(true)
  rebatePrograms RebateProgram[]
}

// ─── AGREEMENTS ───────────────────────────────────────────────────────────────

model Agreement {
  id                String          @id @default(uuid())
  vendorId          String
  vendor            Vendor          @relation(fields: [vendorId], references: [id])
  merchType         MerchType
  source            Source
  description       String
  buyerId           String          // FK to users.id
  buyer             User            @relation("AgreementBuyer", fields: [buyerId], references: [id])
  delegateId        String?         // FK to users.id
  estimatedValue    Decimal         @db.Decimal(15, 2)
  startDate         DateTime        @db.Date
  endDate           DateTime        @db.Date
  status            AgreementStatus @default(PRE_NEGOTIATION)
  submittedViaPortal Boolean        @default(false)
  notes             String?

  // Approval chain audit
  dmmApprovedBy     String?
  dmmApprovedAt     DateTime?
  gmmApprovedBy     String?
  gmmApprovedAt     DateTime?
  apApprovedBy      String?
  apApprovedAt      DateTime?
  rejectedBy        String?
  rejectedAt        DateTime?
  rejectionReason   String?

  // Relations
  rebatePrograms    RebateProgram[]

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

// ─── REBATE PROGRAMS ──────────────────────────────────────────────────────────

model RebateProgram {
  id              String          @id @default(uuid())
  programNumber   String          @unique  // e.g. "R-048291"
  description     String
  rebateTypeCode  String          // FK to rebate_types.code
  rebateType      RebateType      @relation(fields: [rebateTypeCode], references: [code])
  categoryId      String
  category        RebateCategory  @relation(fields: [categoryId], references: [id])
  source          Source          // locked at creation — derived from rebateType
  analystId       String          // FK to users.id
  analyst         User            @relation("ProgramAnalyst", fields: [analystId], references: [id])
  agreementId     String?         // nullable — may be created without an agreement
  agreement       Agreement?      @relation(fields: [agreementId], references: [id])
  startDate       DateTime        @db.Date
  endDate         DateTime        @db.Date
  active          Boolean         @default(true)
  notes           String?

  // Relations
  rebateVendors   RebateVendor[]

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

// ─── REBATE VENDORS ───────────────────────────────────────────────────────────

model RebateVendor {
  id              String              @id @default(uuid())
  rebateProgramId String
  rebateProgram   RebateProgram       @relation(fields: [rebateProgramId], references: [id])
  vendorId        String
  vendor          Vendor              @relation(fields: [vendorId], references: [id])
  active          Boolean             @default(true)

  // Relations
  rebateVendorDepts RebateVendorDept[]

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([rebateProgramId, vendorId])
}

// ─── REBATE VENDOR DEPTS ──────────────────────────────────────────────────────

model RebateVendorDept {
  id              String          @id @default(uuid())
  rebateVendorId  String
  rebateVendor    RebateVendor    @relation(fields: [rebateVendorId], references: [id])
  departmentCode  String          // e.g. "018"
  departmentName  String          // e.g. "Health & Beauty"
  classCode       String          @default("-1")
  active          Boolean         @default(true)

  // Relations
  calculateResults CalculateResult[]

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([rebateVendorId, departmentCode])
}

// ─── CHECKS ───────────────────────────────────────────────────────────────────

model Check {
  id              String    @id @default(uuid())
  rebateVendorId  String    // which vendor on which program
  rebateVendor    RebateVendor @relation(fields: [rebateVendorId], references: [id])
  checkNumber     String
  checkDate       DateTime  @db.Date
  amount          Decimal   @db.Decimal(15, 2)
  appliedToPeriod Int?      // fiscal period this check applies to
  appliedToYear   Int?
  status          String    @default("PENDING")  // PENDING | CLEARED | RETURNED
  clearedAt       DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// ─── DEDUCTIONS ───────────────────────────────────────────────────────────────

model Deduction {
  id              String    @id @default(uuid())
  rebateVendorId  String
  rebateVendor    RebateVendor @relation(fields: [rebateVendorId], references: [id])
  deductionNumber String
  deductionDate   DateTime  @db.Date
  amount          Decimal   @db.Decimal(15, 2)  // negative = reduces earnings
  reasonCode      String    // e.g. "RETURN_CREDIT", "PRICE_ADJUSTMENT"
  notes           String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────

model Invoice {
  id              String    @id @default(uuid())
  invoiceNumber   String    @unique  // e.g. "INV-2025-0418"
  rebateVendorId  String
  rebateVendor    RebateVendor @relation(fields: [rebateVendorId], references: [id])
  invoiceType     String    // ACCRUAL | DEDUCTION | PREPAID
  fiscalPeriod    Int
  fiscalYear      Int
  amount          Decimal   @db.Decimal(15, 2)
  sentAt          DateTime?
  dueDate         DateTime  @db.Date
  paidAt          DateTime?
  status          String    @default("PENDING")  // PENDING | SENT | PAID | OVERDUE
  // Delivery tracking (from SendGrid in production)
  deliveryStatus  String?   // QUEUED | SENT | DELIVERED | OPENED | BOUNCED | FAILED
  deliveredAt     DateTime?
  openedAt        DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// ─── USERS ────────────────────────────────────────────────────────────────────

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  name            String
  analystCode     String?   @unique  // e.g. "LB" — used for program assignment display
  role            UserRole
  active          Boolean   @default(true)
  lastLoginAt     DateTime?

  // Relations
  assignedPrograms  RebateProgram[]  @relation("ProgramAnalyst")
  buyerAgreements   Agreement[]      @relation("AgreementBuyer")
  reportJobs        ReportJob[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// ─── TIER STRUCTURE ───────────────────────────────────────────────────────────
// Tiers live on the rebate program, not on acct_control_master.
// A program can have 1–N tiers. The E&C engine evaluates them in order.

model RebateTier {
  id              String        @id @default(uuid())
  rebateProgramId String
  rebateProgram   RebateProgram @relation(fields: [rebateProgramId], references: [id])
  tierLevel       Int           // 1, 2, 3...
  fromAmount      Decimal       @db.Decimal(15, 2)
  toAmount        Decimal?      @db.Decimal(15, 2)  // null = unlimited
  rate            Decimal       @db.Decimal(8, 6)   // e.g. 0.015000 = 1.5%
  tierType        String        @default("INCREMENTAL")  // INCREMENTAL | FLAT

  @@unique([rebateProgramId, tierLevel])
}
```

---

## 3. Updated Seed Guidance (replaces §9 of VRS_Schema_Reference.md)

| Entity | Count | Notes |
|--------|-------|-------|
| vendors | 50 | Power-law earnings distribution — 5 large ($10M+), 15 mid ($1–10M), 30 small (<$1M) |
| rebate_types | 12 | R-COTRKT, R-NSA, S-NSA, S-SCAN, D-COTRKT, N-ADVCOOP, N-COTRKT, C-TPR, B-COTRKT, S-S5S5, R-PREPAID, D-SCAN |
| rebate_categories | 6 | HBA, GROCERY, SEASONAL, GENERAL_MDSE, HARDLINES, APPAREL |
| rebate_tiers | ~300 | 2–3 tiers per program on average |
| agreements | 80 | Spread across all statuses. Exactly 8 at PENDING_AP_APPROVAL to show queue + bubble rings. |
| rebate_programs | 150 | Mix of source types. Each links to a rebate_type (compound code). |
| rebate_vendors | ~180 | Most programs: 1 vendor. A few: 2–3. |
| rebate_vendor_depts | ~400 | 2–3 depts per rebate_vendor. |
| calculate_results | ~2000 | **P01–P04: mostly FINALIZED** (green vendors). A handful in P04 still OPEN for red/amber demo. P05: mix of OPEN/PENDING_REVIEW/REVIEWED/APPROVED. |
| calculate_result_adjustments | ~10 | A few post-finalization adjustments on P03 records for demo. |
| acct_control_master | ~24 | R-COTRKT/S-NSA/N-ADVCOOP/D-SCAN × ACCRUAL/RECLASS/DEDUCTION × RSL/AP/GL |
| checks | ~60 | Mix of PENDING and CLEARED, spread across vendors |
| deductions | ~20 | Return credits and price adjustments |
| invoices | ~300 | P01–P04 mostly PAID. A few OVERDUE for red bubble demo. P05 PENDING. |
| users | 5 | LB (AP_ANALYST), MK (AP_MANAGER), JA (BUYER), RW (DMM), EX (READ_ONLY) |
| fiscal_periods | 5 | P01–P04 FY2025: isClosed=true. P05 FY2025: isClosed=false. |
| analytics_summaries | ~400 | One per vendor/dept/source/period. transactionVolumePy = transactionVolume × (0.85 + rand × 0.30). yoyVariancePct derived. tierAlert=true on ~10% of rows. anomalyFlag=true on ~5 rows (for red bubble demo). |
| vendor_portal_users | 3 | One portal user per 3 of the large vendors |

**Bubble color distribution target for demo (P04 as reference period):**
- ~35 vendors GREEN (P04 all FINALIZED, no flags)
- ~10 vendors AMBER (P04 has a PENDING_REVIEW calc, or tier_alert, or queue pending)
- ~5 vendors RED (P04 has an OPEN calc that was never run, or anomaly_flag, or overdue invoice >60 days)

This gives a visually meaningful bubble field — mostly green, enough amber and red to demonstrate the health encoding without making the demo look like a disaster.

---

## 4. Revised Bubble Health Computation (replaces §8.7 of VRS_Schema_Reference.md)

```typescript
// /src/lib/bubble-health.ts

type BubbleHealth = 'GREEN' | 'AMBER' | 'RED';

function computeBubbleHealth(vendor: VendorWithRelations): BubbleHealth {
  const closedPeriodCalcs = vendor.calculateResults.filter(
    cr => cr.fiscalPeriod === MOST_RECENTLY_CLOSED_PERIOD
      && cr.fiscalYear === CURRENT_FISCAL_YEAR
  );

  // RED conditions — genuine problems
  const hasOpenInClosedPeriod = closedPeriodCalcs.some(cr => cr.status === 'OPEN');
  const hasAnomalyFlag = vendor.analyticsSummaries.some(s => s.anomalyFlag);
  const hasOverdueInvoice60 = vendor.invoices.some(
    inv => inv.status !== 'PAID' && daysSince(inv.dueDate) > 60
  );

  if (hasOpenInClosedPeriod || hasAnomalyFlag || hasOverdueInvoice60) return 'RED';

  // AMBER conditions — actionable but not urgent
  const hasUnapprovedInClosedPeriod = closedPeriodCalcs.some(
    cr => cr.status !== 'FINALIZED'
  );
  const hasActionableInOpenPeriod = vendor.calculateResults.some(
    cr => cr.fiscalPeriod === CURRENT_OPEN_PERIOD
      && (cr.status === 'PENDING_REVIEW' || cr.status === 'REVIEWED')
  );
  const hasTierAlert = vendor.analyticsSummaries.some(s => s.tierAlert);
  const hasQueuePending = vendor.agreements.some(
    a => a.status === 'PENDING_AP_APPROVAL'
  );
  const hasOverdueInvoice30 = vendor.invoices.some(
    inv => inv.status !== 'PAID' && daysSince(inv.dueDate) > 30
  );

  if (hasUnapprovedInClosedPeriod || hasActionableInOpenPeriod
      || hasTierAlert || hasQueuePending || hasOverdueInvoice30) return 'AMBER';

  return 'GREEN';
}
```

OPEN calculations in the current open period are **normal and do not color the bubble**.

---

## 5. Complete CalculateResultStatus (updated)

```prisma
enum CalculateResultStatus {
  OPEN
  PENDING_REVIEW
  REVIEWED
  APPROVED
  FINALIZED
  // ADJUSTED removed — post-finalization changes use calculate_result_adjustments table
}
```

---

*This document supersedes VRS_Schema_Reference.md on all points where they conflict.
Read both documents together — this one resolves contradictions, adds missing models,
and does not repeat content that was correct in the original.*

*Last updated: April 2026 · TPG Partners*