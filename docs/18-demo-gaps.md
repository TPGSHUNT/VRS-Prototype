# Demo Gaps — Current State vs Demo Goals

**Date:** 2026-05-16
**Method:** Live DB verified against `db-baseline-state.md`; full `web/`+`worker/` source inventory; goals taken from `docs/15-handoff-12-may-2026.html` §3/§A + P1–P3 punch list, `docs/06-design-language.md`, and handoff §4 build areas.
**Companion:** `docs/19-ken-asks.md` (what we still need from Ken). This doc is what *we* must build/fix; that doc is what we must *ask*.

---

## 0. Demo goals (the bar we're measuring against)

> **Demo thesis (authoritative — supersedes the handoffs' IT/form-conversion framing).**
> The demo is a **vision pitch: present DG a completely new, *frictionless* way to look at and work the system.** DG's, Ken's, and Khari's perspective and expectations — including the expectation that the deliverable is "convert your Oracle Forms inventory" / "a fully working AI-converted form" — are **moribund and are explicitly NOT the bar.** That mental model is what the demo aims to *displace*, not satisfy. `docs/11-handoff.md` §3.6 and `docs/15-handoff-12-may-2026.html` §A are **stale on this point.**
>
> **Expect this outdated view to keep being reinforced.** Ken/DG will continue offering input that persists their existing mental model. Do not treat it as requirements to meet — it is precisely what the demo must dispel. **The success bar:** the prototype must be so dynamic, frictionless, and compelling that once they've used it, the *existing* system feels slow, awkward, and clunky to them by contrast. Every gap and priority in this doc is weighed against that felt-contrast, not against parity with what they describe.

| # | Goal | Source |
|---|---|---|
| G1 | **The frictionless reimagining is the pitch.** A viewer lands in the bubble field and immediately grasps a new way to see the whole vendor-rebate estate — no menus, no form-hunting, state always visible, work comes to you. This *is* the load-bearing claim. | David 2026-05-16; 06 §1 |
| G2 | Bubble field is THE frictionless work surface (no top nav; filters/actions slide over). | 06 §1.1 |
| G3 | Slider panels: **left = actions** (filters, period-close checklist, agreement wizard, approval queue, report submit); **right = data** (vendor record tabs, report viewer). | 06 §1.2, §5 |
| **G4** | **Ask Vera — CENTRAL goal, co-equal with G1/G2 (David, 2026-05-16).** Must "knock their socks off": on **real multi-year data**, surface money left on the table the legacy system structurally cannot show — lapsed/closed programs with continuing activity, dept coverage gaps, tier under-attainment, YoY collapse — with grounded-or-refuse guardrails. The single most direct felt-contrast weapon. | David 2026-05-16; 06 §5 |
| G5 | **Seat switcher** (NOT a login — see §2 P1): no-login is *more* faithful (real VRS has no login screen, SSO-only per Ken) and on-thesis (zero auth friction). Named personas with real role/group semantics, persistent in the header for live seat-hopping, captioned "Signed in via SSO — like production." | 15-handoff P1; David 2026-05-16 |
| G6 | Data fidelity: negative earnings, AP#/IP# dual identity, sequence IDs (not UUID), 12/4-5-4 calendar, Rebate-vs-Extract date pairs, real scale & multi-year. | 15-handoff P2 |
| G7 | Glossary discipline: Rebate Program ≠ Agreement ≠ Contract everywhere. | 15-handoff P2 |

---

## 1. Current state (verified, not assumed)

**Database** — untouched synthetic baseline, exact match to `db-baseline-state.md`:
- 50 vendors, 150 programs, 85 agreements, 2,370 calc rows, 7 users, **FY2025 P01–P05 only**, migration `20260502010319_init` only.
- `finalEarnings` sum +59.7M, **min −419** → effectively all-positive (real data is negative).
- 0 / 85 agreements have notes (no planted Vera narratives). Synthetic beverage vendor names. UUID PKs. No AP#/IP#. Schema is **13-period / 4-4-5**.

**Code** — what exists in `web/src`:
- `login/` role-card picker; `(app)/page.tsx` KPI strip; `bubble-field/WorkSurface`+`BubbleField` with X/Y/size metric selectors; `layout/` AppShell+Header+notification-bell+user-menu; `lib/bubble-data.ts`, `lib/permissions.ts`; api routes `auth`, `notifications`.
- **That is the entire app.** `worker/src/index.ts` is a stub that throws on any job. No report handlers. Prisma client in `packages/db`.
- Constraint: `web/AGENTS.md` says this is a **modified Next.js** — any code work must first read `node_modules/next/dist/docs/`.

---

## 2. Functionality gaps (what to build), by priority

### P0 — The frictionless surfaces that *are* the pitch (G1/G2/G3). Currently ~Sprint-2 only.
The thesis lives or dies on whether a viewer can *feel* the frictionless model. The bubble field exists; everything that makes it a **work surface** rather than a chart does not:
- **Right slider — vendor record** (tabs: Overview · 1010 Intelligence · Programs · Calculations · Agreements · Invoices · Activity; default tab role-driven). Not built. **Clicking a bubble currently does nothing** — this is the most visible hole in the vision.
- **Left slider — actions.** None of: filter panel, period-close checklist, agreement wizard, approval-queue inline, report submit. "Work comes to you" is unbacked without these.
- **Bubble interactions:** right-click context menu, lasso/box select, mode toggles. Only X/Y/size dropdowns exist.
- **Ask Vera presence** (G4): even a stub drawer matters — Vera is part of what makes the model feel new. See P1.
- **Bubble axes** (15-handoff P1): drop `estimatedValue` as default (S5S5-only); add **Merch Type × Earnings** preset; aggregate by Vendor **Name** not number. Current default axes `contractValue`/`annualEarnings`/`grossVolume`; Merch-Type axis and name-aggregation absent.

### P1 — Vision depth & correctness for a credible walk-through (G4/G5).
- **Ask Vera** — persistent drawer, two-tier, "uncaptured opportunity" capability. 0% built. Highest *conceptual* risk; needs real multi-year data (G6) + a concrete example (`docs/19` K6).
- **Seat switcher** (replaces the abstract role-card grid; G5). **Decision made 2026-05-16: no login.** Rationale: real VRS has *no login screen* — SSO-only, the system just knows who you are (Ken, round 3); a login would add friction the real product doesn't have, look like every other enterprise app (anti-thesis), and pull Khari toward auth plumbing in a vision pitch. The current grid's real problem is that enum cards (`AP_ANALYST`…) read as a dev scaffold and don't match how DG thinks (people/seats, not role codes). Replace with: named personas carrying real role/security-group semantics; persistent in the **header** (not just an entry gate) so the driver hops Buyer→AP Analyst→AP Manager live and the surface visibly re-shapes; explicit caption *"Signed in via SSO — no login screen, exactly like production VRS."* Add Delegate indicator + FPA Supervisor seat. **Caveat:** we have real role/group structure + real usernames but no clean name→role map (unanswered Ken Q#21) — personas are curated demo identities with real role semantics, **not** labelled as specific real DG employees.
- **Shell behavior corrections** (15-handoff P1): audit log visible to all roles; AP-stage approval → APA not APM; Review/Approve/Finalize only on APM+Admin; Batch-on-Demand on APA; reports split AP/MDSE; renewal alerts on APA tagged "enhancement." None applied.
- Period-close workflow (the headline friction-elimination story — the single best proof of the thesis), approval-queue work-management, agreement status timeline, notification click-through per `06 §1.3` (bell exists; targets don't).

### P3 — Not the bar: Oracle Forms conversion.
- **An AI-converted legacy form is, at most, an illustrative aside — not load-bearing and not required for the demo.** Per the demo thesis (§0), DG/Ken/Khari's expectation of a "working converted form" is precisely the moribund framing we are displacing. If a converted-form vignette is ever wanted as a *contrast* device ("here's your old form → here's the new way"), it would draw on the screenshots in `docs/17`; it does **not** gate anything and should not pull schedule or Ken-asks ahead of P0/P1. Deprioritized deliberately.

---

## 3. Data gaps (what to fix/ingest), by priority

### D1 — Calendar & sign (schema-affecting, Ken-confirmed; blocks correctness).
- Schema/seed: **13-period / 4-4-5** → must be **12-period / 4-5-4** (`FiscalPeriod`, `CalculateResult.fiscalPeriod`, `Batch`, all period logic, bubble health's closed/open derivation, aging).
- `bubble-data.ts:141` sums `finalEarnings` sign-naively; real earnings are **negative** (vendor owes DG; verified visually −$949M, `docs/17`). Decide normalize-on-ingest vs render-sign; fix the sum + KPI + axis semantics.

### D2 — Real data ingest (blocks Vera + realism; G6).
- DB is 100% synthetic, single FY2025, 5 periods. Real extracts on the share: `CALCULATE_RESULT_2024/2025/2026.csv` (~575 MB total, 3 fiscal years), `REBATE_PROGRAM/_VENDOR/_VENDOR_DEPT.csv`. **None ingested.** Vera's "uncaptured opportunity" needs the multi-year substrate; synthetic single-year cannot show it.
- Real scale to reflect: ~2,500 vendors, ~7,665 programs, ~40K calc rows/period, multi-billion-$ portfolio. Current 50/150 is demo-thin but the *portfolio numbers* read wrong.

### D3 — Identity & keys (G6).
- No `AP #` (VARCHAR(9), Lawson, canonical AP-side) / `IP #` (NUMBER(5), Island Pacific, MDSE-side) dual identity on Vendor. Aggregate by Vendor **Name** (one vendor → many AP#s).
- UUID PKs vs legacy `REBATE_ID NUMBER(10)` sequence. VRS is system-of-record; seed should use sequence-shaped IDs for realism in any surfaced ID.
- `RebateVendorDept` date model: legacy has **Rebate Begin/End vs Extract Begin/End** (Extract starts earlier so PMU+Margin both compute period 1). Schema has single date pair — Margin logic breaks against real data.

### D4 — Reference-data realism (G7, polish).
- Categories: schema has 6 tidy codes; real is ~2,029 (mostly Ad-Coop circular codes). Add the real list (`Ken_answers_1.txt` / round-2 xlsx Tab 1) + a "legacy artifact" tooltip if surfaced.
- Source codes: real set B/C/D/E/F/N/P/Q/R/S/T/X (X=Store Transfers, P unused) — already in `Ken_answers_1.txt`; align any dropdowns.
- Frequency domain (Begin/End of Rebate, Calendar Quarter/Month, Custom, Period, Quarter in Arrears/Advance, Weekly) — transcribed in `docs/17`; align schema (currently no Frequency concept).
- Approval thresholds now known: **DMM ≥ $250K, GMM ≥ $1M**, `DMM_APPROVE_TPR=No` (`Ken_answers_4_may12.txt`). Seed/agreement logic should reflect these instead of synthesized values.
- `AcctControlMaster`: prototype is a flat 28-row table; real is 3-table (`_DETAIL` 378 / `_FUNCTIONS` 14) with a **fixed 10-transaction** routing (PMU/Margin/AdvCoop/OtherCoop × Reclass/Accrual + Deductions/Checks → RSL/GL/AP; see `docs/17` image067). Demo can keep the flat table but the Acct Type list and 10-row structure should look real.

### D5 — Subsystem honesty (G1 credibility).
- Prototype models the AP rebate spine only; real VRS is 603 tables / many subsystems (`docs/16`). Not a "fix," but the demo narrative must not over-claim. NSA/S5S5/BOPIS/MDSE-side/Damages are explicitly out of scope — say so.

---

## 4. Severity summary

| Gap | Blocks | Effort (rough) | Depends on Ken? |
|---|---|---|---|
| P0 sliders (vendor record, left actions, bubble click) | G1/G2/G3 — the frictionless model is unfeelable without them | High | No |
| D1 calendar + sign | Correctness of every period/earnings view | Low–Med | No (Ken-confirmed) |
| P1 Ask Vera | G4 — part of what makes the model read as *new* | High | Partly — K6 (example) |
| D2 real-data ingest | Vera + realism (G4/G6) | Med | No (data on disk) |
| P1 period-close workflow | The single strongest proof of friction-elimination | Med–High | No |
| D3 identity/keys/dates | Data fidelity (G6), Margin correctness | Med | Partly — K2 (date pairs) |
| P1 seat switcher + shell rules | Walk-through credibility; kills the "is this a scaffold?" read | Low–Med | No (May-12 answers resolve it) |
| D4 reference realism | G7 polish | Low | No |
| P3 Oracle-Forms conversion | **Nothing — explicitly not the bar (§0)** | n/a | No (do not gate on K1) |

**Bottom line:** the prototype is a credible *bubble-field + data-model* slice but not yet a *frictionless work surface* — clicking a bubble does nothing, and there are no slide-over actions, so the thesis can't yet be *felt*. Closing P0 (sliders/vendor record) + P1 (a believable Vera + the period-close friction story) on real-ish data is what makes the vision land. D1 (calendar/sign) is cheap and should precede any showing. The Oracle-Forms-conversion deliverable that the handoffs treat as central is **deliberately off the critical path** — it serves the moribund expectation the demo is meant to replace. Sequencing/authorization is a David decision per working norms; this is the punch list, not a commitment.
