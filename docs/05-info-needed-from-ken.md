# Information Needed from Ken Banks

Asks grouped by sprint dependency. Ken delivered an initial batch on 2026-05-02 (5 CSV/text samples in `P:\TPG\Dollar General\VRS Web\`). This document tracks what's been answered, what's partially answered, and what's still open.

If anything is sensitive, column lists or screenshots are fine in lieu of full files.

---

## A. Needed by week 2 — seed data realism

### A.1 — Department codes and names ⚠️ PARTIAL
The Rebate Program Extract sample shows real codes are 3-digit numeric (e.g. `100`, `210`). I've seeded plausible placeholder codes (`100`, `120`, `140`, `160`, `180`, `200`, `210`, `220`, `240`, `260`, `300`, `400` with descriptive names) but the actual DG dept code list is still needed to make the demo land with real merch hierarchy.

### A.2 — Vendor number format ✅ ANSWERED
Plain integer (e.g. `262529`, `1179`, `94677`). Schema and seed updated.

### A.3 — Rebate program number format ✅ ANSWERED
Plain integer (e.g. `71922`, `6064`, `57098`). Schema and seed updated.

### A.4 — DG fiscal calendar dates for FY2025 P01–P05 ❌ STILL OPEN
Still using placeholder dates anchored to a Feb fiscal-year start. Need actual `periodStart` / `periodEnd` for those five periods.

### A.5 — Approval threshold rules ❌ STILL OPEN
Still need:
- What `estimatedValue` threshold triggers DMM approval?
- What additional condition triggers GMM escalation?
- Which merch types are pre-approved (skip DMM/GMM)?

### A.6 — Tier rate examples ✅ ANSWERED (partial)
Ken's tier explanation file confirmed:
- **NSA programs have NO tiers** — they have a separate subsystem driven by store counts (New / Remodel / Relocate). Schema and seed updated to skip tiers for NSA.
- **Tiers are a variation on a Standard calculation** — base calc is either `% of Cost` or `Amt per Unit`.
- **4 distinct tier types exist** (Ken referenced but didn't enumerate). Our schema currently has `INCREMENTAL` / `FLAT` as a String — keep as String for now until Ken specifies the four types.

Specific example tier structures (e.g. "Tier 1: $0–$5M @ 1.5%, Tier 2: $5M–$15M @ 2.0%") still not provided — using synthesized values.

### A.7 — Tier mode usage ✅ ANSWERED
Both `INCREMENTAL` and `FLAT` exist. Plus `Amt per Unit` and `Lump Sum` are tier variants per Ken. Schema's String-typed `tierType` field accommodates all four; full E&C engine implementation deferred to Sprint 3.

### A.8 — Earnings component semantics ❌ STILL OPEN
We're using `pmuEarnings`, `marginEarnings`, `advcoopEarnings`, `otherCoopEarnings` as the four columns on `calculate_results`. Ken hasn't confirmed these labels match what an analyst would expect to see. Also: the Rebate Program Extract sample shows columns `% of Cost` and `% Level` we've now added to `RebateProgram`, but the underlying earnings-component model on calculation rows needs Ken's read.

---

## A.9 — NEW: Rebate Type code system ❌ STILL OPEN

The schema docs described `RebateType.code` as a compound `Source-MerchType` key (e.g. `R-COTRKT`). Ken's extract shows real Rebate Type codes are unitary and don't always match that pattern: `NSANS`, `OTHERNSP`, `SPND5SV5`, `PSTAUDPY`, `DCALLONS`, etc. Need:
- Are real Rebate Type codes a denormalized display of `(Source, MerchType)` or a separate code system?
- If separate, what's the full list and what does each code mean?

For the prototype we've kept the compound `R-COTRKT` style. Replacing later is a clean rename if needed.

## A.10 — NEW: Pay Type / Earn Type / SBT Type single-letter codes ❌ STILL OPEN

The Rebate Program Extract shows these fields with single-letter codes:
- **Pay Type:** `C`, `D`, `G`, `M`, `T`, `W`
- **Earn Type:** `M`
- **SBT Type:** `N`
- **Frequency:** `P`

Schema and seed include placeholder values matching real distribution. Need Ken to enumerate what each letter means so we can convert to enums and labels in production.

## A.11 — NEW: Source field display labels ❌ STILL OPEN

Real extract shows full text labels in the Source column: `No Source`, `Receipts - Domestic`, `Drop Ships`, `Sales`, `Discount Amt/BOGO`, `Store Transfers`, `Receipt & Drop Ship`, plus NS variants (`NS - Period`, `NS - Quantity`, `NS - Rate`) and compound codes (`DMGDCNS`). Our schema has 10 single-letter codes (R/S/D/B/F/C/N/E/Q/T). Need:
- Confirmation that the codes are stored as letters in the DB and just displayed as text labels.
- What do `NS - Period` / `NS - Quantity` / `NS - Rate` mean (sub-classifications of N?).
- Is `Receipt & Drop Ship` a real combination or a display synthesis?

## A.12 — NEW: Approval status display naming ❌ STILL OPEN

Unapproved Extract shows status display values like `(Delegate) Pending Buyer Approval` — a delegate-specific intermediate status not in our enum chain. Need:
- Is this a separate status, or a display variant of an existing one when delegated?
- Full list of status display labels mapping to internal enum values.

## A.13 — NEW: SVP organizational role ❌ STILL OPEN

Unapproved Extract shows an `SVP` column above DMM in the org hierarchy. Need:
- Does SVP have approval rights in the agreement chain, or is it purely informational?
- If it does, where does it sit (above GMM)?
- Is it covered by AP_MANAGER in our role enum, or is it a new role?

---

## B. Needed by week 5–6 — report fidelity

### B.1 — Sample XLSX exports from current rwservlet ⚠️ PARTIAL
Ken delivered:
- ✅ **Rebate Program Extract** (`RebateProgramExtact.csv`, 38,745 rows, 27 columns) — column structure now known and schema updated to match (added `payType`, `frequency`, `altApNumber`, `payApNumber`, `earnType`, `sbtType`, `pctOfCost`, `pctLevel`, `closedAt`).
- ✅ **Unapproved Extract** (`UnapprovedExtract.csv`, ~250 rows, 12 columns: SVP, DMM, Agmt ID, Status, Buyer, Merch Type, Category, Begin Date, End Date, Vendor Name, Forecast, Last Status Change).
- ❌ **History Extract** — still needed.
- ❌ **Earnings Summary by Merch Type** — still needed. (Note: Ken did send `ActVrs_Plan.csv` which is a year-over-year roll-up by program type — useful but probably a different report.)
- ❌ **Batch Detail Report** — still needed.

### B.2 — Typical row counts and runtimes ❌ STILL OPEN
Rebate Program Extract appears to be ~38k rows in a typical extract — that informs sizing. Still need runtimes under the current Oracle Reports system to set realistic demo expectations.

### B.3 — Real GL account codes and routing ❌ STILL OPEN
Still need 6–8 representative real entries for `acct_control_master`. Currently using synthetic `ACCT-050000`-style placeholders.

---

## C. Needed by week 7–8 — Vera context and demo polish

### C.1 — 1010 analytics shape ❌ STILL OPEN
What metrics are pulled nightly today and at what grain? `ResceiptsHistory.csv` from Ken shows per-SKU, per-receipt, per-DC detail but that's the source data, not the summary. Need the summary shape DG actually consumes.

### C.2 — Demo narrative input ❌ STILL OPEN

### C.3 — Khari pre-demo session ❌ STILL OPEN

---

## D. NEW context from Ken's data we should adopt

These aren't asks — they're things Ken's samples taught us:

- **`ActVrs_Plan.csv`** is a year-over-year program type roll-up showing LY / LYTD / CYTD PLAN / CYTD ACT / variances. This appears to be the kind of finance dashboard that would live behind a "Plan vs Actual" surface. Worth adding as a future surface beyond the build plan.
- **Real annual rebate earnings are massive.** Volume rebate alone is ~$225M/year; New Store Allowance ~$517M/year; total is in the multi-billion range. Our seed dollar amounts ($50K–$8M per program) are realistic per program but the portfolio-level numbers should reflect this scale.
- **`ResceiptsHistory.csv` shows the source-data grain** (one row per receipt × SKU × DC × week). Far below the calculate_results level. Confirms our schema doesn't need a `Receipt` model — that lives in 1010.
- **Receipt-level columns include**: SKU, Class #, DC, Calc ID, PO # / Ref PO #, Week Deduction Seq. None of these need to surface in the prototype but they exist if a deep-dive view is ever requested.
- **NSA is its own subsystem.** Per-store, per-SKU calculations driven by New / Remodel / Relocate store lists. Out of scope for prototype per build plan; flagged as a major Phase 2 effort.

---

## Delivery

No specific format needed. CSV, Excel, screenshots, or a Teams chat with answers is fine. David is coordinating direct with Ken — please return answers to him and he will route to engineering.

---

*Last updated: 2026-05-03 after Ken's first-batch delivery.*
