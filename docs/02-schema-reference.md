# VRS Schema Reference
## Definitive Enum & Data Model Specification for Claude Code
### TPG Partners · April 2026 · Confidential

---

## 1. Enums

### 1.1 Source Codes
Applied to `rebate_programs.source`. Locked at creation — cannot be changed after a program is created.

| Code | Description | Notes |
|------|-------------|-------|
| `R` | Receipts (Domestic) | Most common. Pulls from 1010 receipt transactions. |
| `S` | Sales | Pulls from 1010 sales transactions. |
| `D` | Drop Ships | Pulls from 1010 drop-ship transactions. |
| `B` | Receipts (Import / Broker) | Import receipt variant of R. |
| `F` | Freight | Freight-based rebate. |
| `C` | Discount / BOGO | Discount and buy-one-get-one recovery. |
| `N` | No Source | Fixed amount — no transaction basis. Manual entry. |
| `E` | EDI | EDI-sourced. |
| `Q` | Quotes | Quote-based. |
| `T` | Transfer | Transfer-based. |

**Prototype seed coverage:** R, S, D, N, C are sufficient. Others exist but are low-volume.

```prisma
enum Source {
  R
  S
  D
  B
  F
  C
  N
  E
  Q
  T
}
```

---

### 1.2 Merch Types

| Code | Description |
|------|-------------|
| `COTRKT` | Contract rebate — most common |
| `ADVCOOP` | Advertising cooperative |
| `NSA` | National Sales Agreement |
| `SCAN` | Scan-based rebate |
| `TPR` | Temporary Price Reduction |
| `S5S5` | Specific promotional structure |
| `PREPAID` | Prepaid rebate |

**Prototype seed coverage:** COTRKT, ADVCOOP, NSA, SCAN are sufficient.

```prisma
enum MerchType {
  COTRKT
  ADVCOOP
  NSA
  SCAN
  TPR
  S5S5
  PREPAID
}
```

---

### 1.3 Agreement Status Chain

Full chain with legal transitions:

```
SUBMITTED_BY_VENDOR        (portal submissions only)
  ↓ buyer accepts
PRE_NEGOTIATION            (all internally-created agreements start here)
  ↓ Move Forward (low value / pre-approved merch types skip DMM/GMM)
PENDING_DMM_APPROVAL       (optional — triggered by value threshold or merch type rule)
  ↓
PENDING_GMM_APPROVAL       (optional — further escalation)
  ↓
PENDING_AP_APPROVAL        (all paths converge here — visible in Approval Queue)
  ↓ AP analyst approves
ASSIGNED                   (rebate program created — active non-terminal state)

Terminal states (no further transitions):
EXPIRED                    (end date passed)
REJECTED                   (returned from any approval step)
CANCELLED                  (withdrawn before assignment)
```

**Legal transition rules:**
- PRE_NEGOTIATION → PENDING_AP_APPROVAL is valid (skipping DMM/GMM) for low-value or pre-approved merch types
- REJECTED is terminal — a rejected agreement cannot re-enter the chain; a new agreement must be created
- ASSIGNED is the only non-terminal end state for active programs
- SUBMITTED_BY_VENDOR → PRE_NEGOTIATION (buyer accepts) or REJECTED (buyer rejects)

```prisma
enum AgreementStatus {
  SUBMITTED_BY_VENDOR
  PRE_NEGOTIATION
  PENDING_DMM_APPROVAL
  PENDING_GMM_APPROVAL
  PENDING_AP_APPROVAL
  ASSIGNED
  EXPIRED
  REJECTED
  CANCELLED
}
```

---

### 1.4 Calculate Result Status

Strictly sequential — no skipping forward, no going backward (except ADJUSTED which follows FINALIZED).

```
OPEN            → E&C not yet run for this period
PENDING_REVIEW  → E&C run, awaiting analyst review
REVIEWED        → Reviewed flag set, awaiting approval
APPROVED        → Approved, eligible for batching
FINALIZED       → Included in a distributed batch, period closed
ADJUSTED        → Post-finalization adjustment (rare, follows FINALIZED only)
```

```prisma
enum CalculateResultStatus {
  OPEN
  PENDING_REVIEW
  REVIEWED
  APPROVED
  FINALIZED
  ADJUSTED
}
```

---

### 1.5 Roles

| Role | Description |
|------|-------------|
| `AP_ANALYST` | Manages rebate programs, calculations, batching for assigned programs |
| `AP_MANAGER` | All AP_ANALYST capabilities + approve calculations, finalize periods, reassign analysts |
| `BUYER` | Creates/edits agreements in own portfolio, initiates Move Forward |
| `BUYER_DELEGATE` | Same as BUYER but scoped to explicitly assigned vendors only |
| `DMM` | District Merchandise Manager — approves agreements in their chain |
| `GMM` | General Merchandise Manager — approves agreements requiring further escalation |
| `READ_ONLY` | Full visibility, no write access. Finance, audit, executive use. |
| `VENDOR_PORTAL` | Separate auth domain. Portal surface only. Cannot access main VRS. |

**Note:** MDSE_MANAGER is not a distinct role — DMM and GMM cover that function.

```prisma
enum UserRole {
  AP_ANALYST
  AP_MANAGER
  BUYER
  BUYER_DELEGATE
  DMM
  GMM
  READ_ONLY
  VENDOR_PORTAL
}
```

---

### 1.6 Report Job Status

```prisma
enum ReportJobStatus {
  QUEUED
  RUNNING
  COMPLETE
  FAILED
  CANCELLED
}
```

### 1.7 Report Job Type

```prisma
enum ReportJobType {
  REBATE_PROGRAM_EXTRACT
  UNAPPROVED_EXTRACT
  HISTORY_EXTRACT
  EARNINGS_SUMMARY_BY_MERCH_TYPE
  BATCH_DETAIL_REPORT
}
```

### 1.8 Function Type (Accounting Control Master)

```prisma
enum FunctionType {
  ACCRUAL
  RECLASS
  PREPAID
  DEDUCTION
}
```

### 1.9 Target System (Accounting Control Master)

```prisma
enum TargetSystem {
  RSL
  AP
  GL
}
```

---

## 2. Earnings Components on calculate_results

The `calculate_results` table holds one row per `(rebate_vendor_dept_id, fiscal_period, fiscal_year)`.
This is the transactional record. `rebate_vendor_depts` is the structural record.

**CRITICAL CONSTRAINT:** A unique constraint on `(rebate_vendor_dept_id, fiscal_period, fiscal_year)` enforces the one-calculation-per-period business rule at the database level.

```prisma
model CalculateResult {
  id                   String                @id @default(uuid())

  // Foreign key — the structural level
  rebateVendorDeptId   String
  rebateVendorDept     RebateVendorDept      @relation(fields: [rebateVendorDeptId], references: [id])

  // Period
  fiscalPeriod         Int                   // 1–13 (DG uses 4-4-5 fiscal calendar)
  fiscalYear           Int                   // e.g. 2025

  // Input volumes (sourced from 1010 for R/S/D/B types; manual for N type)
  receiptAmount        Decimal?              @db.Decimal(15, 2)
  salesAmount          Decimal?              @db.Decimal(15, 2)
  dropshipAmount       Decimal?              @db.Decimal(15, 2)
  fixedAmount          Decimal?              @db.Decimal(15, 2)

  // Rate application
  tierLevel            Int?                  // which tier applied: 1, 2, 3...
  rateApplied          Decimal?              @db.Decimal(8, 6)  // e.g. 0.022500

  // The four earnings components shown on the Vendors & Depts tab
  pmuEarnings          Decimal               @default(0) @db.Decimal(15, 2)  // Purchase Markup / primary
  marginEarnings       Decimal               @default(0) @db.Decimal(15, 2)  // Margin component
  advcoopEarnings      Decimal               @default(0) @db.Decimal(15, 2)  // Advertising cooperative
  otherCoopEarnings    Decimal               @default(0) @db.Decimal(15, 2)  // Other cooperative
  totalEarnings        Decimal               @default(0) @db.Decimal(15, 2)  // sum of four above (computed)

  // Adjustment
  adjustmentAmount     Decimal               @default(0) @db.Decimal(15, 2)  // positive or negative
  adjustmentReason     String?

  // Final (totalEarnings + adjustmentAmount)
  finalEarnings        Decimal               @default(0) @db.Decimal(15, 2)

  // Status
  status               CalculateResultStatus @default(OPEN)

  // Audit
  runAt                DateTime?             // when E&C was executed
  reviewedAt           DateTime?
  reviewedBy           String?
  approvedAt           DateTime?
  approvedBy           String?
  finalizedAt          DateTime?
  createdAt            DateTime              @default(now())
  updatedAt            DateTime              @updatedAt

  // Enforce one-calculation-per-period-per-vendor-dept
  @@unique([rebateVendorDeptId, fiscalPeriod, fiscalYear])
}
```

---

## 3. Period Grain

**DG uses a 4-4-5 fiscal calendar.** 13 periods per fiscal year. Periods do NOT align with calendar months. Each period is either 4 or 5 weeks.

Periods are referenced as P01–P13. The fiscal year does not align with the calendar year.

```prisma
model FiscalPeriod {
  id           String   @id @default(uuid())
  fiscalPeriod Int      // 1–13
  fiscalYear   Int      // e.g. 2025
  periodStart  DateTime @db.Date
  periodEnd    DateTime @db.Date
  isClosed     Boolean  @default(false)
  closedAt     DateTime?
  closedBy     String?

  @@unique([fiscalPeriod, fiscalYear])
}
```

**Prototype seed:** Populate P01–P05 of FY2025. P01–P04 closed. P05 open (the "current" period for demo purposes).

---

## 4. Three-Level Hierarchy

Confirmed structure:

```
rebate_programs
  └── rebate_vendors          (one row per vendor on the program)
        └── rebate_vendor_depts    (one row per dept for that vendor)
                └── calculate_results   (one row per fiscal period — transactional)
```

A `rebate_program` has many `rebate_vendors`.
A `rebate_vendor` has many `rebate_vendor_depts`.
A `rebate_vendor_dept` has many `calculate_results` (one per period).

The unique constraint on `calculate_results(rebateVendorDeptId, fiscalPeriod, fiscalYear)` is the schema-level enforcement of the one-calculation-per-period rule.

---

## 5. acct_control_master Column Set

The lookup key is `(rebateType, functionType, targetSystem)` — this must be unique. The batch process uses this to determine routing for each calculation.

```prisma
model AcctControlMaster {
  id                  String       @id @default(uuid())

  // Lookup key — must be unique
  rebateType          String       // FK to rebate_types.code
  functionType        FunctionType // ACCRUAL | RECLASS | PREPAID | DEDUCTION
  targetSystem        TargetSystem // RSL | AP | GL

  // Routing config
  accountCode         String       // GL account string
  costCenter          String
  transactionTypeCode String       // code sent to the downstream system

  description         String?
  active              Boolean      @default(true)

  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  @@unique([rebateType, functionType, targetSystem])
}
```

---

## 6. analytics_summaries Shape

Pre-aggregated fact table. One row per `(vendorId, departmentCode, source, fiscalPeriod, fiscalYear)`.

The nightly job (node-cron in prototype, Temporal.io in production) truncates and rebuilds this table from 1010 data. In the prototype, the seed script populates it with plausible mock values derived from calculate_results mock data.

```prisma
model AnalyticsSummary {
  id                   String   @id @default(uuid())

  // Dimensions
  vendorId             String
  vendor               Vendor   @relation(fields: [vendorId], references: [id])
  departmentCode       String   // e.g. "018"
  source               Source   // R | S | D — which transaction type
  fiscalPeriod         Int
  fiscalYear           Int

  // Volume measures
  transactionVolume    Decimal  @db.Decimal(15, 2)  // receipts/sales/dropship $ this period
  transactionVolumePy  Decimal  @db.Decimal(15, 2)  // same period prior year
  yoyVariancePct       Decimal  @db.Decimal(8, 4)   // computed: (current - py) / py

  // Tier context (denormalized from rebate program for fast UI query)
  currentTier          Int?                          // tier currently in effect
  tierThresholdNext    Decimal? @db.Decimal(15, 2)  // $ needed to hit next tier
  paceToTargetPct      Decimal? @db.Decimal(8, 4)   // annualized run rate vs. threshold
  tierAlert            Boolean  @default(false)      // true if within 5% of next threshold

  // Anomaly
  anomalyFlag          Boolean  @default(false)
  anomalyReason        String?

  // Metadata
  computedAt           DateTime @default(now())      // when nightly job ran

  @@unique([vendorId, departmentCode, source, fiscalPeriod, fiscalYear])
}
```

**Metrics exposed on the 1010 Intelligence tab:**
- `paceToTargetPct` → progress bar (0–100%+, red if under 75%, amber 75–95%, green 95%+)
- `yoyVariancePct` → sparkline / delta badge
- `tierAlert` + `tierThresholdNext` → callout when within 5% of tier boundary
- `anomalyFlag` + `anomalyReason` → warning banner on vendor record

---

## 7. report_jobs Table

```prisma
model ReportJob {
  id            String          @id @default(uuid())
  type          ReportJobType
  params        Json            // filter parameters used (merch type, period, vendor, etc.)
  status        ReportJobStatus @default(QUEUED)
  requestedById String
  requestedBy   User            @relation(fields: [requestedById], references: [id])
  queuedAt      DateTime        @default(now())
  startedAt     DateTime?
  completedAt   DateTime?
  outputUrl     String?         // file path or object storage URL
  errorMessage  String?
  expiresAt     DateTime?       // output file retention (7 days from completedAt)

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}
```

---

## 8. Key Business Rules for Claude Code

These should be enforced at the service layer (TypeScript) AND at the schema level where possible:

1. **One calculation per period:** `@@unique([rebateVendorDeptId, fiscalPeriod, fiscalYear])` on `calculate_results`. Attempting to run E&C twice for the same period must throw a conflict error, not silently overwrite.

2. **Source is immutable:** Once a `rebate_program` is created, `source` cannot be changed. Enforce with a service-layer check on any UPDATE to rebate_programs.

3. **Status transitions are one-directional:** `calculate_results.status` moves OPEN → PENDING_REVIEW → REVIEWED → APPROVED → FINALIZED only. No skipping, no reversal (except ADJUSTED which is additive, not a status reversal). Enforce in the status transition service.

4. **Agreement rejection is terminal:** A REJECTED agreement cannot be un-rejected. Enforce by making REJECTED a terminal state with no outbound transitions in the agreement status machine.

5. **Approval Queue visibility:** Only agreements with status `PENDING_AP_APPROVAL` appear in the AP Approval Queue. `queuePending` on the vendor bubble is derived from this — a vendor has `queuePending=true` if any of their agreements are in `PENDING_AP_APPROVAL` status.

6. **Finalize is AP_MANAGER only:** The `FINALIZE` action on the period close checklist (which closes a FiscalPeriod and sets `isClosed=true`) is gated to `AP_MANAGER` role. All other period close steps are available to `AP_ANALYST`.

7. **Vendor bubble health computation:** Health status is computed server-side on the `/api/vendors/bubble-data` route:
   - `GREEN`: all calculate_results for current period are APPROVED or FINALIZED, no anomaly flags, no queue pending
   - `AMBER`: any calculate_result is OPEN or PENDING_REVIEW past its expected run date, OR a tier alert exists, OR queue is pending
   - `RED`: any calculate_result is overdue (OPEN and period is > 7 days old), OR an anomaly flag is set, OR an invoice is overdue

8. **4-4-5 fiscal calendar:** Period references are always `(fiscalPeriod, fiscalYear)` pairs — never a raw date. The `fiscal_periods` table is the source of truth for period start/end dates.

---

## 9. Seed Data Guidance

For the prototype, seed the following realistic distribution:

| Entity | Count | Notes |
|--------|-------|-------|
| vendors | 50 | Power-law earnings distribution — 5 large ($10M+), 15 mid ($1-10M), 30 small (<$1M) |
| rebate_programs | 150 | Mix of R, S, D, N source types. Spread across COTRKT, ADVCOOP, NSA, SCAN merch types. |
| rebate_vendors | ~180 | Most programs have 1 vendor; a few have 2-3 |
| rebate_vendor_depts | ~400 | 2-3 depts per vendor per program on average |
| calculate_results | ~2000 | P01-P04 all FINALIZED; P05 mix of OPEN/PENDING_REVIEW/APPROVED to demo period close |
| agreements | 80 | Spread across all statuses including ~8 at PENDING_AP_APPROVAL (to show queue + bubble rings) |
| users | 5 | One per role: AP_ANALYST (LB), AP_MANAGER (MK), BUYER (JA), DMM (RW), READ_ONLY (EX) |
| fiscal_periods | 5 | P01-P05 FY2025. P01-P04 isClosed=true. P05 open. |
| analytics_summaries | ~400 | One per vendor/dept/source/period. Derive paceToTargetPct from calculate_results mock data. |
| acct_control_master | ~20 | Cover COTRKT × ACCRUAL/RECLASS × RSL/AP/GL combinations at minimum |

---

## 10. File Structure Recommendation

```
/prisma
  schema.prisma          ← single source of truth for all types above
  ingest/real_ingest.py  ← real DG ingest (vendors/programs/calc)
  load-acm.ts            ← real AcctControlMaster loader (ROUND_4)
  fixtures/              ← committed real extracts (no synthetic seed)

/src
  /lib
    /db.ts               ← Prisma client singleton
    /auth.ts             ← NextAuth config
    /permissions.ts      ← role-permission utility (canApproveCalculation, etc.)
    /status-machines
      agreement.ts       ← agreement status transition logic + legal transition map
      calculate-result.ts ← calculate_result status transition logic
    /reports
      queue.ts           ← BullMQ job submission
      worker.ts          ← BullMQ worker dispatcher
      /handlers
        rebate-program-extract.ts
        unapproved-extract.ts
        history-extract.ts
        earnings-summary.ts
        batch-detail.ts
    /vera
      service.ts         ← VeRAService class (provider-agnostic)
      anthropic-provider.ts
      azure-provider.ts  ← stub for production
  /app
    /api
      /vendors
        /bubble-data/route.ts
      /reports
        /queue/route.ts
        /status/[jobId]/route.ts
        /download/[jobId]/route.ts
    /(main)
      /vendors/[id]/page.tsx
      /period-close/page.tsx
      /reports/page.tsx
    /page.tsx            ← bubble field landing page
```

---

*This document is the definitive schema reference for the VRS prototype. All enum values, status chains, and data shapes defined here supersede any values mentioned in the build plan documents.*

*Last updated: April 2026 · TPG Partners*