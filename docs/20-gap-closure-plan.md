# Gap-Closure Plan

**Date:** 2026-05-16
**Closes:** the gaps in `docs/18-demo-gaps.md`, measured against the thesis in `docs/18` §0 / memory `project_demo_thesis` — the bar is a *felt contrast*: after using the prototype, the legacy system should feel slow, awkward, clunky.
**Status:** This is a **plan, not authorization.** Per working norms, nothing here is started until David greens the relevant phase. No demo date is assumed — sequencing is dependency-ordered, not calendar-dated; give a date and a schedule can be overlaid.

---

## Operating constraints (apply to every coding phase)

1. **Modified Next.js.** `web/AGENTS.md`: this is not stock Next — read the local guide under `node_modules/next/dist/docs/` *before* writing app code. (Exact path not yet located on this machine — Step P0.0 is to find it; do not write app code until it's read.)
2. **Design language is binding.** `docs/06-design-language.md` — left=actions / right=data sliders, no top nav, 200ms transitions, bubble field is the only home. Build to it, not around it.
3. **Glossary discipline.** Rebate Program ≠ Agreement ≠ Contract, everywhere (15-handoff P2). Bake into a shared label module so it can't drift.
4. **Ken-ask coupling.** K2/K7 (`docs/19`) are out for answer and touch the schema. The schema work is structured so their answers *slot in* rather than block — see Phase 0.
5. **Ask before code/commits.** Each phase below has an explicit gate. Observations ≠ directives.

---

## Data sufficiency for a socks-off Vera (verified against the real CSVs)

**Verdict: yes — we have enough for a genuinely jaw-dropping Vera, today, without waiting on Ken.** Confirmed by inspecting the real column structure on the share:

- **`CALCULATE_RESULT_2024/2025/2026`** (~575 MB, 3 fiscal years) carries the full earnings decomposition at vendor/dept/class/period grain *plus trend built in*: `prior_year_tot`, `prior_year_ytd`, `curr_year_ytd`, `ytd_*`, `ltd_ear`, `rev_*` reversals, `*_eadj/_aadj` adjustments, `payment_type`, `deduct_freq`, review/approve dates. → YoY, pace-to-target, anomaly, period-over-period, lifetime-to-date are all directly computable.
- **`REBATE_PROGRAM`** carries `rebate_beg/end_date`, `extract_beg/end_date` (**this effectively answers K2 — both date pairs are in the data**), `closed_date`, `delete_flag`, `rebate_flag`, `core_flag`, `tier_type/_thresh_type/_calc_type`. → **lapsed/closed-but-still-active programs, coverage gaps, tier-config drift** are detectable.
- **`REBATE_VENDOR_DEPT`** carries `ip_vendor_num` (the IP# dual identity — partially answers D3), `amt_per_unit`, `pct_per_unit`, `ltd_collected/reclassed/prepaid/unpaid`, `cur_*`, `ytd_*`.

**The achievable "knock their socks off" narrative, fully grounded in data we have:** *"Here are vendors where DG is leaving money on the table"* — programs that lapsed/closed while the vendor kept transacting, departments rebated under one program but not their siblings, tier thresholds chronically under-attained, earnings collapsing YoY while volume held. The legacy system shows **none** of this.

**Two follow-up asks that take Vera from "very impressive" to "devastating" — not blockers** (added to `docs/19` as K8/K9):
- **K8 — `REBATE_TIER` / `REBATE_TIERS` extract.** We have tier *flags* on the program but not the breakpoints/rates. Without them, "wrong tier structure" and exact threshold-proximity are approximations, not precise.
- **K9 — agreement/coverage extract (MDSE side), if extractable.** Lets Vera say "the *agreement* lapsed" from agreement records rather than inferring from program `closed_date`. Likely hard (separate MDSE side); proxy from program lifecycle is good enough for the demo.

The purest "uncaptured" (purchase volume with *no* rebate program at all) needs 1010/`VRS_SALES`/`VRS_DISCOUNT` — not on the share and not VRS-queryable per Ken. **We design around it:** the lapsed/coverage/tier/YoY proxy is real, defensible, and demo-devastating without it.

---

## Phase 0 — Foundation & correctness (no Ken dependency, do first)

**Objective:** a schema + seed that is *correct* and *extensible*, so every surface built on it is trustworthy. Cheap, high-leverage, unblocks everything.

| Step | Item | Gap | Notes |
|---|---|---|---|
| P0.0 | Locate & read the modified-Next guide | constraint 1 | Blocks all app code, not data work |
| P0.1 | Schema rewrite: **12-period / 4-5-4** | D1 | `FiscalPeriod`, `CalculateResult.fiscalPeriod`, `Batch`, all period logic + bubble-health closed/open derivation. Ken-confirmed; no wait. |
| P0.2 | Earnings **sign** — **DECIDED 2026-05-16 (Decision ①, see below)** | D1 | Normalize internally to positive (value-to-DG); **never display a naked signed number** — always labeled ("$X earned" / "$Y owed to DG"); preserve the legacy-signed value in a shadow column **and** an "Accounting view" drill that matches their Period Accounting Summary. Fix `bubble-data.ts:141` sum, KPI strip, axis semantics accordingly. Demo posture: if they balk at the visual treatment, assure them it's trivially configurable and adjust to their preference. |
| P0.3 | Vendor dual identity: add **AP #** (VARCHAR9) + **IP #** (NUMBER5); aggregate by **name** | D3 | Bubble + everywhere vendor is keyed |
| P0.4 | Sequence-shaped IDs for surfaced identifiers (REBATE_ID etc.) | D3 | Keep UUID PKs internally; display sequence-style |
| P0.5 | Schema seams for pending Ken answers | K2/K7 | Add nullable Extract Begin/End alongside Rebate dates (K2); put the "active" predicate behind one query helper (K7) so the answer is a one-line change |
| P0.6 | Reference realism in seed | D4 | Real approval thresholds ($250K/$1M, `DMM_APPROVE_TPR=No`), real Source/Frequency domains, ~real Category bloat sample. **AcctControlMaster: load the real matrix** from `VRS_DATA_ROUND_4.xlsx` (2,842 rows, 203 rebate_types, RSL/GL/AP routing — `docs/19` K3 RESOLVED) instead of a shaped stand-in; also seeds the authoritative `rebate_type`/`acct_type` domain. |
| P0.7 | Migration + **real reload** (no reseed) | — | Real-data path only (`real_ingest.py` + `db:load-acm`); `docs/db-baseline-state.md` synthetic fingerprint is retired (2026-05-17) |
| P0.8 | Shared glossary/label module | G7 | Used by every later surface |

**Exit criteria:** after `npm run db:migrate`, `python prisma/ingest/real_ingest.py` + `npm run db:load-acm` yield a 12/4-5-4, correctly-signed, dual-identity **real** dataset; bubble field still renders against it. *(2026-05-17: synthetic seed retired — no `db:seed`/`db:reset`; real-data path only. Memory `project_no_synthetic_data`.)*
**Gate:** David approves the schema change + Decision ① before migration runs (it invalidates the current DB).

---

## Phase 1 — Make it a work surface (the thesis itself)

**Objective:** clicking and acting *in place*. This is the single biggest credibility jump — today a bubble click does nothing, so the "frictionless" claim is unbacked.

| Step | Item | Gap |
|---|---|---|
| P1.1 | **Right slider — vendor record**, tabbed (Overview · 1010 Intelligence · Programs · Calculations · Agreements · Invoices · Activity); default tab role-driven | P0 |
| P1.2 | Bubble **click** → opens P1.1; **right-click** → context menu (Open / Run report / Ask Vera / Approve) | P0 |
| P1.3 | **Left slider — actions shell**: filter panel first (always-available), framework reused by later actions | P0 |
| P1.4 | **Lasso / box select** + selection actions (side panel / explode / filter-to-these) | P0 |
| P1.5 | **SUPERSEDED/EXPANDED → `docs/21-bubble-index-model.md`** (design agreed 2026-05-17). The narrow original scope was an axis-label fix; it is now a full triage-first, seat-driven index-model redesign that is **re-sequenced after the seat switcher** (P2.3 — see §"Sequencing"). Only the trivial **fix the false `($, log)` subtitle** (scale is rank-percentile, not log — don't claim log in a demo) remains an independent, do-anytime P1 item. Feasible-now metrics (`docs/21` §3 ✅) may be built in parallel; per-seat default wiring waits on P2.3. | P0 |
| P1.6 | Slider mechanics per design language: dim+blur field, Esc/close, configurable widths, multi-open | G2/G3 |
| P1.7 | **Seat-scoping model** (settled spec below) — estate vs operator default views, soft lens never a cage | G1/G5 |

**Exit criteria:** a viewer can land → see a field **scoped to their seat** → switch seat and watch it visibly re-shape → click a vendor → read a real tabbed record → open a filter that slides over and recomputes the KPI strip, never leaving the surface.
**Gate:** David approves after P0; P1.1 is the keystone — review it before the rest of P1 proceeds.

### P1.7 — Seat-scoping model (settled 2026-05-16)

Two tiers, driven by the signed-in seat. **Scope is a soft default lens, never a permission cage** — every scoped seat still carries the lasso + filters and a prominent *"viewing your N of ~2,500 — show all"* control, so the see-the-whole-estate power is never hidden, only defaulted.

- **Estate-wide by default** (the whole field is home): `READ_ONLY` (finance/audit/executive — schema §1.5 exists *for* this), `AP_MANAGER` (oversees all analysts), `VRS_ADMIN`/`VRS_MANAGER` (admin tier), `FPA_SUPERVISOR` (MDSE estate).
- **Scoped by default** (their slice, one click to "show all"): `AP_ANALYST` → assigned programs (`RebateProgram.analystId`); `BUYER`/`BUYER_DELEGATE` → portfolio (`Agreement.buyerId`; Buyers Dashboard is buyer/delegate-only per Ken #6); `DMM`/`GMM` → approval chain.

**Honest-fidelity caveat:** legacy VRS security is **form-level**, not row-level (Security form Fix 522, `docs/17` — Maintenance/Read-Only/No-Access per *form*). Per-seat *data* scoping is a **design improvement we are introducing**, on-thesis ("work comes to you"), **not** a claim of legacy fidelity. Pitch it as the new frictionless model; do not assert it mirrors their system. No Ken ask needed.

**Demo beat:** the seat switcher must change the *nature* of the surface, not just filter it — an operator seat reads "my work, brought to me"; the finance/exec (or `AP_MANAGER`) seat reveals the entire multi-billion-$ estate to lasso and slice. Drive the lasso-the-estate showpiece from the estate seat; sell focus from a buyer/analyst seat. This operator↔estate flip is a primary felt-contrast moment — coordinate with the seat switcher (memory `project_no_login_seat_switcher`) and the demo run-of-show (P4.3).

Implementation: `getBubbleData()` takes a scope arg derived from the session seat; the seed already carries `analystId`/`buyerId`. Default tab stays role-driven (`permissions.defaultVendorRecordTab`).

---

## Phase 2 — Make it read as genuinely new

**Objective:** the depth that produces the felt-contrast — guided workflow + intelligence the old system structurally cannot show.

| Step | Item | Gap | Notes |
|---|---|---|---|
| P2.1 | **Period-close workflow** as a left-slider guided checklist with persistent state + blockers | P1 | The strongest single proof of friction-elimination; pick this as the demo's centerpiece moment |
| P2.2 | **Ask Vera** drawer — shell + two-tier interaction + tool contract + hallucination guardrails (deny-by-default, cite-or-refuse) | P1/G4 | Real answers wait on Phase 3 data; build the surface + contract now |
| P2.3 | **Seat switcher** (NOT a login — decision 2026-05-16). **RE-SEQUENCED 2026-05-17: build this FIRST — it is a prerequisite of the `docs/21` bubble-index model (per-seat defaults have no delivery vehicle without it).** Named personas w/ real role/group semantics, persistent in header for live seat-hopping, "Signed in via SSO — like production" caption; + Delegate indicator + FPA Supervisor seat | P1/G5 | Rationale: real VRS has no login screen (SSO-only, Ken) — no-login is more faithful *and* on-thesis. Replaces the scaffold-looking enum grid. Personas are the real DG people with real roles (TPG built/maintains VRS; confirm the featured few with Ken/David — trivial, not a data-pull). May-12 answers resolved the role modeling. |
| P2.4 | Shell behavior corrections (audit log all-roles; AP-stage→APA; Review/Approve/Finalize APM+Admin only; Batch-on-Demand APA; reports AP/MDSE split; renewal alerts on APA tagged "enhancement") | P1 | From 15-handoff P1 |
| P2.5 | Notification click-through routing per `06 §1.3` | P1 | Bell exists; targets don't |
| P2.6 | Agreement status timeline (visual progression, no "Move Forward" hunt) | P1 | |

**Exit criteria:** the period-close story can be walked end-to-end; Vera answers grounded questions with citations and refuses ungrounded ones; role switches change shells correctly.
**Gate:** David approves after P1. Decision point ② — confirm period-close as the centerpiece vs an alternative hero moment.

---

## Phase 3 — Real substrate (backs Vera + realism)

**This is a CENTRAL workstream, not a late phase.** It starts the moment Phase 0 lands and runs **in parallel with Phase 1/2** — Vera's wow-factor is a co-primary demo goal (G4), so its substrate is on the critical path. "Phase 3" is a sequence label, not a priority rank.

**Objective:** real multi-year data in, and a Vera that makes the room go quiet.

| Step | Item | Gap | Notes |
|---|---|---|---|
| P3.1 | Ingest pipeline for the share CSVs: `CALCULATE_RESULT_2024/25/26` (~575 MB), `REBATE_PROGRAM/_VENDOR/_VENDOR_DEPT` | D2 | Streamed/batched loader; map the real columns (now known) → schema; apply Decision ① sign rule. **Start immediately after P0.** |
| P3.2 | Governance note | D2 | Real DG financial data → confirm the DB's eventual home is governance-approved (Azure, not 3rd-party) before this leaves the local container; **Decision point ③** |
| P3.3 | Vera **"money on the table" capability** on real data | **G4 (central)** | The four detectors, all computable from data we have (see "Data sufficiency"): (a) lapsed/closed programs with continuing vendor activity, (b) dept coverage gaps, (c) tier under-attainment, (d) YoY earnings collapse vs held volume. K8 (tier tables) sharpens (c) when it lands; K6 exemplar tunes the narrative — **neither blocks**. |
| P3.4 | Vera grounding contract: deny-by-default, cite-or-refuse, every claim traceable to a row | G4 | Mandatory before any real-data answer is shown — financial demo |
| P3.5 | Scale/realism pass: portfolio numbers reflect real magnitude; counts believable | D2 |

**Exit criteria:** the demo runs on real multi-year data; Vera, unprompted-on-click or on ask, surfaces ≥1 concrete real (sanitized) "you're leaving $X with vendor Y because Z" case, with the underlying rows one click away — and refuses cleanly when it can't ground an answer.
**Gate:** Decision ③ (data governance/home) before any real data is ingested anywhere non-local. Start P3.1/P3.3 in parallel with Phase 1 once P0 lands.

---

## Phase 4 — Polish & narrative

| Step | Item | Gap |
|---|---|---|
| P4.1 | Glossary/label sweep across every surface | G7 |
| P4.2 | Subsystem-honesty framing in the UI/script (AP rebate spine shown; NSA/S5S5/BOPIS/MDSE explicitly out of scope per `docs/16`) | D5 |
| P4.3 | Demo run-of-show: scripted path that maximizes the felt-contrast (land → scan → click → act → period-close → Vera) | thesis |
| P4.4 | Performance/transition polish (200ms everywhere, no jank at 50→300 bubbles) | G2 |

---

## Dependency graph (what blocks what)

```
P0 (schema/correctness) ─┬─► P1 (work surface) ──► P2 (depth) ──┐
                          │                                      ├─► P4 (polish)
                          └─► P3 (real data + Vera) ─────────────┘   [CENTRAL, parallel]
Ken K2     ─► already answered by the data (REBATE_PROGRAM has both date pairs); confirm semantics only
Ken K7     ─► slot into P0.5 (non-blocking seam)
Ken K8/K9  ─► sharpen P3.3 (non-blocking)
Ken K6     ─► tunes P3.3 narrative (non-blocking)
Ken K3/K5  ─► refine P0.6 realism (non-blocking)
```

Two co-equal critical paths after P0: **(work-surface)** P0 → P1 → P2.1 period-close → P4, and **(Vera, central)** P0 → P3.1 ingest → P3.3 capability → P3.4 grounding → P4. Vera does **not** wait for the UI work — start P3 in parallel the moment P0 lands. The demo's two hero moments are the period-close friction-kill *and* Vera's money-on-the-table reveal; both must land.

### Sequencing — seat switcher before the bubble-index model (decided 2026-05-17)

The original P1.5 axis fix is now the **triage-first, seat-driven index
model** (`docs/21-bubble-index-model.md`). Its per-seat defaults can't ship
without a seat to drive them, so **P2.3 (seat switcher) is pulled ahead as a
prerequisite**:

```
seat switcher (P2.3) ──► per-seat index defaults (docs/21 §4)
feasible-now metrics (docs/21 §3 ✅) ──┘   [parallel; no switcher/Ken dep]
D1/D2/K8 (docs/19) ──► D1/K8/D2-dependent metrics (docs/21 §7) [as they arrive]
false-log subtitle fix ──► independent, do anytime
```

Net: P2.3 moves from "Phase 2" ordering to *immediately actionable*; the
P1.5-successor index work follows it rather than preceding it.

## Decision points needing David

1. ~~**Earnings sign**~~ **RESOLVED 2026-05-16 (David):** normalize internally to positive; never show a naked signed number (always labeled "$X earned" / "$Y owed to DG"); keep legacy-signed value in a shadow column + an "Accounting view" drill matching their Period Accounting Summary. If they balk at the visual treatment, assure them it's trivially configurable and change it to taste. Phase 0 cleared to start.
2. **Demo centerpiece** — confirm period-close as the hero friction-elimination moment (vs Vera, vs bubble-lasso). Shapes P2 + P4.3.
3. **Real-data home/governance** — where the real DG financial data is allowed to live before P3 ingest leaves the local container.
4. **Build ownership/timeline** — who implements (and is there a demo date)? Lets a schedule be overlaid on these phases.

## Risks

- **Schema break (P0.7) invalidates the current DB and baseline.** Mitigated by re-capturing the baseline manifest in the same step.
- **Vera hallucination in a financial demo** is the highest reputational risk — P2.2 builds the guardrail contract *before* wiring real data, deliberately.
- **Real-data volume** (~575 MB, 3 FYs) — P3.1 must stream, not load-in-memory; budget for it.
- **Modified Next.js** — unread API surface (`web/AGENTS.md`); P0.0 is a hard prerequisite, not a formality.

## Explicitly NOT in this plan

Oracle-Forms conversion / a "working converted form." Per `docs/18` §0 and memory `project_demo_thesis`, that serves the moribund expectation the demo exists to displace. It is off the critical path and not scheduled here. If ever wanted as a *contrast vignette*, it is a Phase 4 aside at most and must not pull P0–P3 effort or Ken-asks forward.
