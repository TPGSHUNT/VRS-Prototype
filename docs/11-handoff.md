# VRS Prototype — Handoff for the Next Thread

**Author:** Claude (continuing) | **Date:** 2026-05-07 | **For:** the next Claude thread to pick this up

---

## 0. How to use this document

This is the single entry point for a fresh thread. Read it once top-to-bottom, then dive into the linked files only when you need depth on a specific area. Sections 1–3 give you orientation; section 4 is the map of existing artifacts; sections 5–8 are the substantive architecture/functionality knowledge.

**Do this first when you pick up:**
1. Read `MEMORY.md` (already auto-loaded into your context).
2. Skim this handoff doc end-to-end.
3. Read `docs/10-target-schema-design.html` — most current strategic artifact.
4. Read `docs/09-current-architecture.html` — what we're building.
5. Skim `docs/08-questions-for-ken.html` — the open questions list.
6. Check `git log --oneline -20` for recent commits.

After that you'll be roughly where the previous thread was at ~75% confidence.

---

## 1. The project in one paragraph

David (Stan Hunt Consulting LLC) is rebuilding Dollar General's **Vendor Rebate System (VRS)** — a 30-year-old Oracle Forms application that calculates and disburses vendor rebates. The legacy author, **Ken Banks**, retires January 2027, which is the forcing function. The new system is a Next.js + Postgres + Prisma web application. The **prototype phase** has two simultaneous goals: (1) evaluate whether the legacy data model is salvageable for the rebuild (it isn't, fully — see schema design doc), and (2) provide a compelling demo for an agentic AI named **Vera** (Vendor Earnings & Rebate Advisor). Production will run on Azure AI Foundry with GPT-4o; the prototype runs on Anthropic Claude.

## 2. Where work stopped

**Current branch:** `main`. Recent commits:
- `a1e5c42` — Phase 2a: bubble field with quadrant layout + axis selectors
- `73c4915` — Initial scaffold

**Sprint status:** Sprint 2 (bubble field). Sprint 1 (scaffold + auth + schema seed) complete.

**The last meaningful work product** was `docs/10-target-schema-design.html` — a comprehensive target schema design with REC items flagged for Ken's sign-off and BLOCKER items flagged for resolution before Prisma write-up.

**Immediate next forcing function** (per the previous thread's last suggestion to the user): bundle questions doc (08) + schema design (10) and send to Ken. His responses to questions 1, 4, 22, 24 (BLOCKER items) plus sign-off on REC items unlocks the actual Prisma schema write-up — estimated "an afternoon" of work once design is approved.

## 3. Calibrated confidence

The previous thread tracked this honestly. As of the last interaction:

- **Pre-Ken-doc dive:** ~60%
- **After reading FDD V4.1, AP_Side_Overview, the ERD, and exploring data:** ~75%

What's missing for the remaining 25%:
- SBT/NSBT acronym + downstream dependence (BLOCKER)
- UNSALE damages scope (BLOCKER — separate subsystem? own tables?)
- 1010 schema reference (BLOCKER — need to know what's queryable)
- CALCULATE_SKU_* scope (BLOCKER — bring forward or archive-only?)
- Verification that storing earnings as positive doesn't break some unseen downstream consumer
- A real read of Sprint 2's bubble-field code quality

---

## 4. Map of existing artifacts

### 4.1 Memory system
Path: `C:\Users\david\.claude\projects\C--Users-david-development-vrs-prototype\memory\`

- `MEMORY.md` — the index (auto-loaded)
- `project_vera.md` — Vera concept, capabilities, two-phase architecture, dual project goals
- `legacy_dg_rebate_model.md` — schema details, state machine, source codes, IP=Island Pacific, Tier Types, schema name (REBATE_OWNER), PM_/AO_ rollups, AADJ vestigial
- `project_stan_data_delivery.md` — Ken Banks context, retirement deadline, data location
- `reference_doc_library.md` — pointer to `P:\TPG\Dollar General\VRS` (the trove)
- `reference_ap_side_overview.md` — canonical field reference (Ken's primary doc)
- `project_legacy_subsystems.md` — UNSALE, MDSE_DASHBOARD, P-family, VENDOR_EMAILS, etc.

### 4.2 In-repo documentation (`docs/`)
- `02-schema-reference.md` — early notes
- `03-schema-clarifications.md` — early Q&A
- `04-schema-addendum.md` — early follow-ups
- `05-info-needed-from-ken.md` — early version of questions list
- `06-design-language.md` — UI/visual design tokens
- `07-bubble-metrics.md` / `.html` — bubble field metric definitions
- `08-questions-for-ken.html` — **current questions list (37 questions, 8 sections)** with "What I learned from your docs" preface
- `09-current-architecture.html` — **current-state architecture doc**, 8 sections: Vision, Stack, Data Architecture, IA, Domain Model (state machines as ASCII), Vera Architecture, Build Status, Open Decisions
- `10-target-schema-design.html` — **most current strategic artifact**, 8 sections: Approach, Subsystem Scope, Core Entities (field-by-field), State Machines, Code Lists, Sign Convention & SBT collapse, Vera-specific Additions, Open Decisions

Doc 06–10 are the live ones. 02–05 are superseded but retained for history.

### 4.3 Ken's source documents (extracted to text)
Path: `docs/ken/`
- `VRS_AP_Side_Overview.txt` — 173KB. Ken's primary reference. CALCULATE_RESULT field defs around p.129 of the original docx.
- `VRS_FDD_V4.1.txt` — 400KB / 9818 lines. 2010 Functional Design Document. Source of agreement state machine, payment_type defaults, security groups, Source Code Addendum A.
- `VRS_Analysis_and_Architecture.txt` — additional context

### 4.4 Source materials (read-only, on the share)
- `P:\TPG\Dollar General\VRS\` — Ken's full document library (13+ files; canonical)
- `P:\TPG\Dollar General\VRS Web\Data\` — 6 CSVs of live data + 15 ERD bitmap exports

### 4.5 Local data extracts
Path: `data/` (git-ignored)
- `data/erd/erd_1.png` … `erd_15.png` — Toad ERD exports converted from BMP. erd_8 = P-family detail. erd_14 = UNSALE detail. erd_6 = MDSE_DASHBOARD (dormant). erd_1/2/3 are macro tiles, too compressed to read.
- CSV samples (gitignored)

---

## 5. Architecture insights — the new system

### 5.1 Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, D3 for the bubble field
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** NextAuth (currently role-sim login; production will be SSO)
- **AI (prototype):** Anthropic Claude API
- **AI (production):** Azure AI Foundry, GPT-4o
- **Hosting (target):** TBD — likely Azure given the AI alignment

### 5.2 Two-phase Vera architecture
The prototype is intentionally a workbench for Vera. Phase 1 (prototype, current): Claude does the agentic reasoning, with tool-use against our Postgres replica of legacy data. Phase 2 (production): same orchestration pattern, but routed through Azure AI Foundry with GPT-4o, with read access to live DG transactional systems including the **1010 transaction database** (DG's billions-of-rows receipt/sales/drop-ship store).

### 5.3 Data architecture — three layers

**Source-of-truth (legacy):** Oracle, schema `REBATE_OWNER` on the RSL DB. ~50+ tables across the families catalogued in `project_legacy_subsystems.md`. Read-only from our perspective. CALCULATE_RESULT is ~190 columns wide.

**Prototype Postgres:** A semantic redesign rather than a schema migration. Key target schema decisions (all marked REC, awaiting Ken sign-off):
- Store earnings as **positive scalars** (sign-flip on ETL ingest, sign-flip back on export) — see section 6.6 below
- **Collapse SBT/NSBT triplication** to single columns + a flag (waiting on Ken to confirm SBT semantics)
- **Drop AADJ** (vestigial — only one ever created; EADJ is the active adjustment mechanism)
- **Drop class_num** (denormalization that doesn't pay rent)
- **Drop FPA + MDSE_DASHBOARD** (Ken's docs flag them as unmaintained; Vera + 1010 supersede)
- **Derive PM_/AO_ rollups in views**, not store as columns

Net result: CALCULATE_RESULT shrinks from ~190 columns to ~30. That's the headline schema win.

**Future production:** A live Postgres mirror or stream off the same source data, with integration paths back to RSL/AP/GL via the existing batch infrastructure.

### 5.4 Information architecture (workbench UI)
The bubble field is the **landing surface** of the workbench. It plots vendor-or-program records on a configurable two-axis grid (axis selectors per quadrant), with bubble size encoding earnings magnitude. From there a buyer drills into agreement detail, tier configuration, and the calculation state machine. The bubble field is the visual hook for the demo and the natural surface where Vera will overlay recommendations.

Per `docs/06-design-language.md`: monospace font system, no emojis (David has explicit preference), grid-aligned spacing.

### 5.5 Build status snapshot (per `docs/09-current-architecture.html`)
- Sprint 1 (DONE): scaffold, role-sim login, AppShell, schema + seed aligned with Ken's CSVs
- Sprint 2 (CURRENT): bubble field with quadrant layout + axis selectors
- Sprint 3 (PENDING): drill-down screens, agreement detail
- Sprint 4 (PENDING): Vera integration, demo polish

8-week, 4-sprint plan.

---

## 6. Functional/domain insights

### 6.1 Three-level hierarchy
```
REBATE_PROGRAM
  └── REBATE_VENDOR
        └── REBATE_VENDOR_DEPT
              └── CALCULATE_RESULT  (the per-period earnings record)
```

A program ties to one or more vendors; each vendor-on-program ties to one or more departments; per-period calculation results live at the leaf.

### 6.2 The four earnings components
Every CALCULATE_RESULT decomposes earnings into four components:
- **PMU** (Purchase Mark Up) — per-unit kickback on purchase
- **Margin** — share-of-margin programs
- **Adv Coop** — advertising co-op
- **Other Coop** — non-advertising co-op

PMU + Margin → rolled up as **PM_** on the Review Screen. Adv Coop + Other Coop → rolled up as **AO_**. All four flow negative in the legacy data (see 6.6).

### 6.3 Calculation state machine
```
Calculated → Reviewed → Approved → Batched → Distributed
```
Revertable up through Batched. After Distributed (records have flowed to RSL/AP/GL), it's frozen. **Year/Period = 0** is the sentinel for "current open period"; real period values are stamped at Finalize.

### 6.4 Agreement state machine (from FDD V4.1)
Routing rules:
- $75K threshold OR TPR merch type → routes to DMM
- Domestic + check payment → routes to DMM regardless of amount
- Otherwise → routes to AP

Security groups: DMM, BUYER, FP&A, FP&A_SUPERVISOR.

### 6.5 Source codes (11 + 1)
R, S, D, B, F, C, P, N, E, Q, T — defined in FDD Addendum A. Plus **X** (Store Allocations, added 2018+).

### 6.6 The negative-earnings convention
**Why earnings are negative in the legacy data** (asked and answered in the previous thread):
1. **AP-system perspective.** AP tracks "what DG owes vendors" with positive numbers. A rebate is the opposite direction — money flowing FROM vendor TO DG — so naturally negative.
2. **Cost-accounting / RSL perspective.** Rebates are contra-cost-of-goods. Storing them negative makes `purchase_cost + rebate_earnings` produce the right net cost.
3. **PMU is literally a markdown.** Marking purchase cost down = subtracting = negative.

Confirmed in data: every CALCULATE_RESULT earnings figure sampled was negative. Confirmed in Ken's image003.png: "Note that the natural state of Earning is *negative*."

**Recommendation in target schema:** flip to positive in Postgres for analytics/Vera ergonomics; flip back at RSL/AP/GL export time. Pending Ken's confirmation that no downstream consumer breaks on this.

### 6.7 Tier types (4)
- **E** — Excess
- **P** — Pre-defined Ranges
- **L** — Predefined Levels
- **G** — Growth

### 6.8 SBT / NSBT split
Every earnings column appears triplicated as `x`, `SBT_x`, `NSBT_x` where `SBT_x + NSBT_x = x`. **The SBT acronym is still unknown** — top BLOCKER question for Ken. Hypothesis: "Subject to" some accounting treatment vs. not. The collapse-recommendation in doc 10 depends on this answer.

### 6.9 IP, ELY, and other glossary items resolved
- **IP** = Island Pacific (DG's merch-side vendor master)
- **ELY** = a payment_type code identified during FDD grep
- **AADJ** = Accrual Adjustments (vestigial; one ever created)
- **EADJ** = Earnings Adjustments (active mechanism)
- **E&C** = Extract and Calculate (the calculation engine, *not* "Earnings and Calculations" as I once guessed)

### 6.10 The 1010 transaction database
DG's billions-of-rows receipt/sales/drop-ship/PO store. The legacy E&C engine extracts from 1010 to produce CALCULATE_SKU_* detail tables, which then aggregate into CALCULATE_RESULT. In the new system Vera will need read access to 1010 for some classes of question. Schema reference is a BLOCKER question.

---

## 7. Open items, by category

### 7.1 BLOCKER — must resolve before Prisma write-up
1. **SBT acronym + downstream dependence** (Q1 in doc 08)
2. **UNSALE damages scope** (Q4) — bring forward fully, or treat as separate subsystem?
3. **1010 schema reference** (Q22) — what tables, what columns, what access?
4. **CALCULATE_SKU_* scope** (Q24) — recreate the SKU-level calc tables in Postgres, or leave archive-only on Oracle?

### 7.2 REC items — need Ken's sign-off
- Sign-flip earnings to positive on ETL
- Collapse SBT/NSBT triplication
- Drop AADJ
- Drop class_num denormalization
- Drop FPA and MDSE_DASHBOARD families
- Derive PM_/AO_ rollups in views

### 7.3 Pending build work
- Sprint 2 bubble field — verify it's actually feature-complete; previous thread did not visually QA
- Sprint 3 drill-downs (not started)
- Sprint 4 Vera integration (not started)
- Prisma schema write-up (blocked on Ken)

---

## 8. Important user/collaboration context

### 8.1 About David
- Senior consultant at Stan Hunt Consulting LLC
- Works alongside Ken Banks (the legacy VRS author at DG)
- Comfortable being challenged; wants calibrated confidence, not cheerleading
- Prefers terse, no-summary responses; reads diffs himself
- No emojis in any artifact
- Wants memory updated as understanding grows

### 8.2 Working preferences observed
- Prefers HTML for "deliverable" docs (08, 09, 10), Markdown for working notes
- Reads documentation top-to-bottom; long docs are fine if they're well-structured
- Will explicitly say "Go" when he wants execution to proceed

### 8.3 Things to avoid
- Don't generate planning/decision documents he didn't ask for
- Don't summarize what was just done at the end of every response
- Don't use emojis
- Don't conflate "extracted" — be precise about file format conversions

---

## 9. Suggested first move for the new thread

Open `docs/10-target-schema-design.html` and read it carefully. Then check whether Ken has responded to the questions doc (08) — if so, reconcile his answers against the BLOCKER list in section 7.1 above. If yes to all four, proceed to Prisma schema write-up. If no, the highest-leverage thing you can do is package the questions doc + schema design as an email-ready bundle for David to send Ken (this was the previous thread's last open suggestion).

If David is mid-conversation about something else entirely, follow his lead — this handoff is a backstop, not a railroad.
