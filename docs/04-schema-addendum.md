# VRS Schema Addendum 2
## Resolves all issues raised against VRS_Schema_Clarifications.md
### TPG Partners · April 2026

---

## Substantive Additions

---

### 1. Batch Model (first-class concept)

Batch is a core period-close entity. A batch groups finalized CalculateResult rows
for export to a single target system (RSL, AP, or GL). One batch per
(fiscalPeriod, fiscalYear, targetSystem, functionType) combination per period-close run.

```prisma
model Batch {
  id              String        @id @default(uuid())
  batchNumber     String        @unique   // e.g. "BCH-2025-0841"
  targetSystem    TargetSystem            // RSL | AP | GL
  functionType    FunctionType            // ACCRUAL | RECLASS | PREPAID | DEDUCTION
  fiscalPeriod    Int
  fiscalYear      Int
  totalAmount     Decimal       @db.Decimal(15, 2)
  recordCount     Int           @default(0)

  // Lifecycle
  createdAt       DateTime      @default(now())
  createdBy       String        // FK to users.id
  exportedAt      DateTime?     // when sent to downstream system
  exportedBy      String?
  finalizedAt     DateTime?     // locked — no further changes
  finalizedBy     String?

  // Relations
  batchItems      BatchItem[]
  adjustments     CalculateResultAdjustment[]

  @@unique([fiscalPeriod, fiscalYear, targetSystem, functionType])
}

// Join model — which CalculateResult rows are in this batch
model BatchItem {
  id                  String          @id @default(uuid())
  batchId             String
  batch               Batch           @relation(fields: [batchId], references: [id])
  calculateResultId   String
  calculateResult     CalculateResult @relation(fields: [calculateResultId], references: [id])
  amount              Decimal         @db.Decimal(15, 2)  // the earnings amount included
  acctControlId       String          // FK to AcctControlMaster — routing at time of batch

  @@unique([batchId, calculateResultId])
}
```

Add back-relation to `CalculateResult`:
```prisma
// Add to CalculateResult model:
batchItems    BatchItem[]
```

Add back-relation to `AcctControlMaster`:
```prisma
// Add to AcctControlMaster model:
batchItems    BatchItem[]
```

**Seed:** 4–5 batches for P04 (one per targetSystem/functionType combination used),
all with exportedAt set. 0 batches for P05 — created during the period-close demo.

---

### 2. Notification Model

Required for persistent bell-icon badge and cross-session delivery of report
completion, queue-pending alerts, and any other async event.

```prisma
enum NotificationType {
  REPORT_COMPLETE
  REPORT_FAILED
  QUEUE_PENDING       // agreement arrived in AP queue
  AGREEMENT_APPROVED  // buyer notification when AP approves their agreement
  AGREEMENT_REJECTED  // buyer notification when AP rejects
  PERIOD_CLOSED       // broadcast to AP_ANALYST and AP_MANAGER when period finalizes
  TIER_ALERT          // Vera proactive: vendor approaching tier threshold
  ANOMALY_FLAG        // Vera proactive: 1010 anomaly detected
}

model Notification {
  id          String           @id @default(uuid())
  userId      String
  user        User             @relation(fields: [userId], references: [id])
  type        NotificationType
  payload     Json             // flexible: { jobId, vendorId, agreementId, message, ... }
  readAt      DateTime?        // null = unread
  createdAt   DateTime         @default(now())
}
```

Add back-relation to `User`:
```prisma
// Add to User model:
notifications   Notification[]
```

**SSE + persistence pattern:**
- On job completion / queue event: write a `Notification` row AND push via SSE
- SSE delivery is best-effort (fire-and-forget for live sessions)
- On login / page load: query `notifications WHERE userId = ? AND readAt IS NULL`
  to populate the bell badge count and unread list
- "Mark all read" sets `readAt = now()` on all unread rows for the user

**Seed:** ~15 pre-seeded notifications per user, mix of read and unread, covering
all NotificationTypes. Gives the bell badge something to show on first load.

---

### 3. Seed Users — add GMM and BUYER_DELEGATE

Seven roles in the enum, seven users in the seed. Updated user table:

| Code | Name | Role | Notes |
|------|------|------|-------|
| LB | Lane B. | AP_ANALYST | Assigned to ~40 programs |
| MK | Mark K. | AP_MANAGER | Oversees all analysts |
| JA | J. Alvarez | BUYER | HBA and Grocery portfolio |
| RW | Robin W. | BUYER_DELEGATE | Assigned to JA's vendors |
| DM | Dana M. | DMM | District Merch Manager |
| GR | Glen R. | GMM | General Merch Manager |
| EX | (read-only) | READ_ONLY | Finance/audit observer |

**Demo agreement chain with full escalation:**
Seed one agreement that traverses the full chain for demo purposes:
- AGR-DEMO-001: status = PENDING_GMM_APPROVAL, dmmApprovedBy = DM
- This lets the demo show GR (GMM) logging in, seeing the agreement, approving it,
  and watching it advance to PENDING_AP_APPROVAL and trigger LB's bubble ring

---

### 4. Agreement.categoryId

**Decision: add `categoryId` to Agreement. Category is set by the buyer at agreement
creation and carries forward to the RebateProgram on approval.**

Rationale: category is a buyer-defined attribute that belongs on the agreement.
Deriving it from merch type would require a merch-type → category mapping table that
doesn't exist and would be an oversimplification (multiple categories can share a merch type).

```prisma
// Add to Agreement model:
categoryId      String
category        RebateCategory  @relation(fields: [categoryId], references: [id])
```

On Approval Queue approval action (service layer):
```typescript
// When AP analyst approves an agreement and creates a RebateProgram:
const program = await prisma.rebateProgram.create({
  data: {
    ...derivedFields,
    categoryId: agreement.categoryId,  // carried forward from agreement
    source: rebateType.source,          // derived from rebateTypeCode
  }
});
```

Add back-relation to `RebateCategory`:
```prisma
// Add to RebateCategory model:
agreements    Agreement[]
```

---

## Minor Resolutions

---

### 5. acct_control_master Seed Count

Corrected to ~36 rows. The combinatorial formula is:

```
4 rebate types (R-COTRKT, S-NSA, N-ADVCOOP, D-SCAN)
× 3 function types (ACCRUAL, RECLASS, DEDUCTION)
× 3 target systems (RSL, AP, GL)
= 36 combinations
```

However, not all combinations are meaningful. Exclude the following:
- `DEDUCTION × GL` — deductions route to AP, not GL
- `RECLASS × AP` — reclasses route to RSL or GL, not AP
- `PREPAID × RSL` — prepaids don't go to revenue sharing ledger

Realistic seed count: **~28 rows** (36 minus ~8 excluded combinations).
Document the exclusions as comments in the seed script.

---

### 6. RebateProgram.source — denormalized field

**Decision: keep the denormalized `source` field on RebateProgram for query convenience.**

Add a service-layer guard: the `createRebateProgram` service function always
derives `source` from `rebateType.source` and never accepts it as an independent input.

```typescript
// In createRebateProgram service:
const rebateType = await prisma.rebateType.findUniqueOrThrow({
  where: { code: data.rebateTypeCode }
});

await prisma.rebateProgram.create({
  data: {
    ...data,
    source: rebateType.source,  // always derived, never caller-supplied
  }
});
```

No CHECK constraint needed in the prototype. Flag for production hardening.

---

### 7. Strings that should be enums — tracked TODOs

The following fields use `String` in the prototype for pragmatic speed.
Each is a candidate for a proper enum in the production schema pass.

Add this comment block to `schema.prisma` above each affected model:

```prisma
// TODO(production): convert to enum
// Invoice.invoiceType    → ACCRUAL | DEDUCTION | PREPAID
// Invoice.status         → PENDING | SENT | PAID | OVERDUE | DISPUTED
// Invoice.deliveryStatus → QUEUED | SENT | DELIVERED | OPENED | BOUNCED | FAILED
// Check.status           → PENDING | CLEARED | RETURNED | VOIDED
// Deduction.reasonCode   → RETURN_CREDIT | PRICE_ADJUSTMENT | DATA_CORRECTION | OTHER
// RebateTier.tierType    → INCREMENTAL | FLAT
```

This keeps them visible in the schema file rather than buried in a separate doc.

---

### 8. Bubble Health Pseudocode — runtime period derivation

`MOST_RECENTLY_CLOSED_PERIOD` and `CURRENT_FISCAL_YEAR` are not constants.
They are derived at request time from the `fiscal_periods` table:

```typescript
// In /src/lib/bubble-health.ts — add at top:

async function getCurrentPeriodContext() {
  // Most recently closed period
  const lastClosed = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: true },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalPeriod: 'desc' }],
  });

  // Current open period
  const currentOpen = await prisma.fiscalPeriod.findFirst({
    where: { isClosed: false },
    orderBy: [{ fiscalYear: 'asc' }, { fiscalPeriod: 'asc' }],
  });

  return {
    closedPeriod: lastClosed?.fiscalPeriod ?? null,
    closedYear:   lastClosed?.fiscalYear  ?? null,
    openPeriod:   currentOpen?.fiscalPeriod ?? null,
    openYear:     currentOpen?.fiscalYear   ?? null,
  };
}

// Cache this at the route handler level — one DB call per bubble-data request,
// not one per vendor. Pass the context into computeBubbleHealth().
```

The `computeBubbleHealth` function signature updates to:
```typescript
function computeBubbleHealth(
  vendor: VendorWithRelations,
  ctx: { closedPeriod: number; closedYear: number; openPeriod: number; openYear: number }
): BubbleHealth
```

---

## 9. Complete Model Dependency Map

Reading order for `schema.prisma` to avoid forward-reference issues:

```
1. Enums (all)
2. FiscalPeriod
3. RebateCategory
4. RebateType
5. Vendor
6. User
7. VendorPortalUser
8. Agreement              (refs Vendor, User, RebateCategory)
9. RebateProgram          (refs RebateType, RebateCategory, User, Agreement)
10. RebateTier            (refs RebateProgram)
11. RebateVendor          (refs RebateProgram, Vendor)
12. RebateVendorDept      (refs RebateVendor)
13. CalculateResult       (refs RebateVendorDept)
14. CalculateResultAdjustment (refs CalculateResult, Batch)
15. Batch                 (refs User)
16. BatchItem             (refs Batch, CalculateResult, AcctControlMaster)
17. AcctControlMaster     (refs RebateType)
18. Check                 (refs RebateVendor)
19. Deduction             (refs RebateVendor)
20. Invoice               (refs RebateVendor)
21. ReportJob             (refs User)
22. Notification          (refs User)
23. AnalyticsSummary      (refs Vendor)
```

Prisma handles circular refs via its own resolution, but this order
minimises confusion when reading the file top-to-bottom.

---

*This document supersedes VRS_Schema_Clarifications.md on all points where they conflict.
Read all three schema documents together:*
*1. VRS_Schema_Reference.md — enums, key models, business rules*
*2. VRS_Schema_Clarifications.md — issue resolutions, remaining model stubs*
*3. This document — Batch, Notification, seed corrections, minor resolutions*

*Last updated: April 2026 · TPG Partners*