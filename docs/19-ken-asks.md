# What We Still Need From Ken — post-evaluation

**Date:** 2026-05-16
**Method:** Every candidate question was checked against `Ken_answers_1/2/3.txt`, `Ken_answers_4_may12.txt`, `Ken_followon_questions.txt`, the round-3 email body, the legacy-Forms screenshots (`docs/17`), the 603-table inventory (`docs/16`), `VRS_AP_Side_Overview.txt`, `VRS_FDD_V4.1.txt`, and `DG_Roles_flat.csv`. Only items that survive that dedup are listed. Companion: `docs/18-demo-gaps.md`.

The recurring lesson from the handoffs: **most "open" questions are already answered somewhere.** §2 below is the do-not-re-ask list — read it before sending Ken anything.

> **Framing correction (2026-05-16).** The demo thesis is a **new frictionless way to see the system**, not Oracle-Forms conversion; DG/Ken/Khari's expectations on that point are moribund and explicitly not the bar (see `docs/18` §0, `docs/11-handoff.md` 2026-05-16 banner). Consequently the legacy-form-spec ask is **no longer demo-critical** and has been moved out of the priority list to §1a. The asks that matter are the ones that make the *vision* land and *correct* (K2, K6, K7, then K3–K5).

---

## 0. ★ DATA TO REQUEST FROM KEN — the real extracts that fill the holes

**This is the list to route to Ken.** After Phase 3.1 (real ingest of vendors/
programs/vendor-depts/calc — done), the prototype runs on real data but three
surfaces go flat because their source extracts were never provided. In
priority order by demo impact:

| # | Extract requested | What it unblocks | Notes |
|---|---|---|---|
| **D1** | **Full MDSE Agreement extract** — the real AGREEMENT table (all statuses, with real estimated value / forecast), not just the ~250-row `UnapprovedExtract` we have | Real **contract value**, **active-agreements**, deeper **Buyer/DMM/GMM seat-scoping**. **+ bubble-index model (`docs/21`): `earningsVsExpected`, `approvalQueueValue`.** Today only ~9 of 2,573 vendors have any agreement value. | We loaded 132 from `UnapprovedExtract` (mostly $0 forecast). Need the full population + real values. Extends old K11. |
| **D2** | **Volume tables** — extract (or vendor×period rollup) of **`SALES_SUMMARY` / `VRS_SALES` / `VRS_DISCOUNT`** | Real **gross commercial volume**, the **entire 1010-Intelligence surface** (pace-to-target, YoY, anomaly) — **Vera-central / socks-off**. **+ bubble-index model (`docs/21`): `grossVolume` size axis, `paceToTarget` coverage, purest `uncapturedOpportunity`.** Currently `AnalyticsSummary` = 0 rows. | Reframed: these are **RSL-DB-resident and extractable like the four we already pulled** — NOT the locked, un-queryable "1010". This is the highest-value ask for the Vera goal. |
| **D3** | **Invoice / billing extract** | Invoice aging, overdue signals, billing realism on the vendor record + health. | `Invoice` table empty. Lower demo-criticality than D1/D2. |
| **D4** *(confirm only)* | One-line confirm of the `year=0 / period=0` "current period" sentinel semantics | Validates the derived real period calendar (already built from the `reviewed/approved/batched/sent` flags). | Not blocking; derivable. |

**Explicitly NOT a Ken ask (don't request):** "make health show red/amber" —
real closed periods are genuinely 100% finalized; that's the truth of DG's
data. The attention signal is a *design* reframe (live period + Vera-derived
opportunity), not missing rows.

**Delivery:** D1 + D2 are the two that matter for the demo's central beats
(MDSE story + Vera). Sanitized is fine. Same extract mechanism as the four
already delivered. David routes to Ken; engineering does not contact Ken.

Older granular items (K1–K12) follow as the working log; D1–D3 supersede the
vague parts of **K11**, and **K12** is the D4 confirm.

---

## 1. Genuinely still open — ordered by demo impact

### K2 — Rebate vs Extract date pairs. **(now largely answered by the data — downgrade to a confirm)**
`REBATE_PROGRAM` on the share carries **all four**: `rebate_beg_date`, `rebate_end_date`, `extract_beg_date`, `extract_end_date`. So the two-pair model is real and we have it. Remaining ask is only **semantic confirmation**: is the rule simply "Extract range usually starts earlier than Rebate range so PMU and Margin both compute in period 1," and are there cases where they're equal or Extract is *later*? Low priority; not blocking — the schema seam (P0.5) already accommodates it.

### K3 — Representative real Accounting Control / GL routing values. **(RESOLVED 2026-05-17 — overshot, not just sampled)**
~~The Accounting Control Master screenshot (`docs/17` image067) shows the Acct Type list and the fixed 10-transaction structure, but the **Account / Offset / Cost Center values are blank** in the capture. For Batch/Distribute to look real we need **6–8 representative real rows**.~~ **Delivered in full as `VRS_DATA_ROUND_4.xlsx`** (on the share, 2026-05-17): the **complete real `AcctControlMaster` routing matrix** — 2,842 rows, not a 6–8-row sample. 203 distinct `rebate_type` codes (full taxonomy incl. NSA*/S5S5/BOPIS/DAMAGES*/SCN*/SBT/VOL*/TPR*), one routing key `(rebate_type, merch_type, rebate_source, acct_type)` per type fanning out to ~14 ledger lines across RSL/GL/AP × Accrual/Reclass/Prepaid/Received, with real `account`/`acct_offset`/`cost_center`/`cost_offset` values and `reverse_sign`/`reverse` flags. Supersedes the docs/17 image067 "blank values" gap entirely. **Now the authoritative `rebate_type` + `acct_type` domain** and the input for the real `AcctControlMaster` seed (`docs/20` P0.6, `docs/18` D4 — no longer "shape it to look real," load it real).

### K4 — Current-system report runtimes. **(supports a "this is faster/less painful" contrast)**
Typical wall-clock runtimes for the main extracts under today's Oracle Reports/rwservlet (e.g., the ~38K-row Rebate Program Extract, a period Batch Detail). Useful as a friction-contrast data point in the vision narrative; not load-bearing. *(docs/05 B.2 — open.)* Also: confirm our report substitutions are acceptable — "Earnings Summary by Merch Type" and "Batch Detail Report" reportedly don't exist; we substituted **Plan-vs-Actual** and **GL Batch**. Ken: are those fair representatives?

### K5 — Single-letter code meanings: Pay Type / Earn Type / SBT Type.
Round 3 gave the Frequency and Pay *value lists*, but the Rebate Program Extract's single-letter columns are still unmapped: **Pay Type** `C/D/G/M/T/W`, **Earn Type** `M`, **SBT Type** `N`. One line each → enum labels. *(docs/05 A.10 — still open; not superseded by round 3.)*

### K6 — One concrete "uncaptured opportunity" example. **(blocks G4 — Vera's headline capability)**
A real, sanitized case where DG missed rebate earnings because an agreement wasn't in place, lapsed, or had the wrong tier structure. Vera's marquee claim ("identifying what doesn't exist") is unfalsifiable and un-demoable without one real exemplar to model the narrative and the detection logic on. *(David asked this in-thread — question #32 — never answered.)*

### K7 — "Active vendor" definition.
Ken gave the count (~2,500 active vendors) but not the **predicate**. What exactly makes a vendor/program "active" (status flag? open rebate in current FY? not expired)? Needed so seed/ingest filters match production semantics. *(docs/05 A.5/Q5 — count answered, definition not.)*

### K8 — `REBATE_TIER` / `REBATE_TIERS` extract. **(sharpens central-goal Vera + bubble-index model)**
**+ bubble-index model (`docs/21`):** makes `tierAttainmentGap` an exact position axis (vs a proxy) and sharpens `uncapturedOpportunity`. We have tier *flags* on `REBATE_PROGRAM` (`tier_type/_thresh_type/_calc_type`) but not the actual breakpoints/rates. Vera's "tier under-attainment / wrong tier structure" detector (a co-primary demo capability) is an approximation without them. A CSV extract of both tables would make that detector exact. **Not a blocker** — the proxy works — but high value-for-effort given Vera is now a central goal.

### K9 — Agreement / coverage extract (MDSE side), if extractable.
To let Vera say "the *agreement* lapsed and was never renewed" from agreement records rather than inferring from program `closed_date` + continued activity. Likely hard (separate MDSE side, per Ken). Ask whether any agreement-to-program coverage extract is feasible; if not, we proxy from program lifecycle and move on. Lowest priority of the Vera asks.

### K10 — Real escalation chain: GMM vs SVP. **(data-flagged, accumulated 2026-05-16)**
**Data tension.** We model the MDSE approval chain as Buyer → DMM → **GMM** (build plan; prototype `UserRole` has GMM, no SVP). But the real `UnapprovedExtract.csv` exposes **SVP and DMM columns and no GMM** (e.g. SVP Bryan Wheeler / Johanna Blankush over DMM Pooh Vichidvongsa over Buyer Jenny ONeill). Yet the real Parameters form (`docs/17` image053) literally names a **"GMM Agreement Threshold"** ($1M) — so "GMM" is a real parameter label while "SVP" is the real column on the agreement extract. These don't obviously reconcile. **Ask Ken:** what is the actual escalation hierarchy above DMM — is it GMM, SVP, both (and in what order), or are GMM and SVP the same tier under different labels? Where does the >$1M "GMM threshold" approval actually land — on an SVP? This is load-bearing for faithful MDSE seat-scoping and the approval-chain demo beat. Supersedes/absorbs the older open SVP item (`docs/05` A.13). *(The lopsided GMM distribution we saw in the seed was a separate seed-fallback artifact, since fixed — not the basis of this question.)*

### K11 — Full Agreement / Invoice / AnalyticsSummary extracts? **(data-flagged, accumulated 2026-05-16)**
Phase 3.1 ingested the four real extracts (REBATE_VENDOR/PROGRAM/VENDOR_DEPT + CALCULATE_RESULT). There is **no real extract for Agreements, Invoices, or the 1010 AnalyticsSummary** on the share — only ~250 agreement rows in `UnapprovedExtract`. Consequence on real data: contract-value/gross-volume KPIs are 0, the 1010 Intelligence tab is empty, and BUYER/DMM/GMM seat-scoping (which keys off Agreement) returns nothing. **Ask Ken:** is there an extractable AGREEMENT table (MDSE side) and an INVOICE/billing extract? The 1010 AnalyticsSummary is nightly-derived (no source table) — confirm whether any 1010 summary extract exists or it must stay computed. Extends K9. Not blocking the AP-side real demo (analyst + estate seats work on real data); load-bearing for the MDSE-side + Vera-volume story.

### K12 — Real fiscal-period calendar (years 0/2023–2026). **(data-flagged)**
Real `CALCULATE_RESULT` carries `year` ∈ {0, 2023, 2024, 2025, 2026} (0 = the VRS "current period" sentinel, per Ken). Our `FiscalPeriod` table is still the synthetic FY2025 1–12. So health/period logic evaluates against FY2025 only and reads flat. **Ask Ken / derive:** the real period close-state per (year, period) — which (year,period) are closed vs open right now — so health and the period-close story reflect the real calendar, not a synthetic stand-in. (May be derivable from `reviewed/approved/batched/sent` flags + dates without Ken — investigate first.)

---

### K13 — `rebate_source = P` appears in real routing data but Ken said "P unused". **(data-flagged, accumulated 2026-05-17)**
**Data tension.** Ken's round-1 answer (recorded in §2 below + memory) states the source code **`P` is never used**. But `VRS_DATA_ROUND_4.xlsx` (the real `AcctControlMaster`) carries **14 rows with `rebate_source = P`** — i.e., P has live ledger-routing config. Minor and non-blocking, but a direct contradiction between Ken's stated domain and his delivered data; do not silently trust either side. **Ask Ken:** is `P` genuinely retired (and these 14 rows are dormant/legacy config), or is the round-1 "P unused" statement out of date? Affects only whether a `P` value should ever surface in a source dropdown. Lowest priority.

> **Accumulator note:** §1 is the running list of genuine questions for Ken. New ones get appended K-numbered, tagged `(data-flagged …)` when surfaced by a real-conditions data review (per memory `feedback_data_reflects_actual_conditions`). Do not start parallel lists elsewhere; do not add items that Ken's delivered data already answers.

---

## 1a. Deprioritized — NOT demo-critical: legacy form spec

Previously listed as the top ask ("K1"). **Removed from the priority list** because the demo thesis is the frictionless reimagining, not Oracle-Forms conversion (`docs/18` §0). Keep only as a contingency: *if* a converted-form contrast vignette is ever explicitly wanted, we'd need — for one chosen form — its `.fmb`/forms export + the PL/SQL package(s) it calls, or a field-and-behavior walkthrough. Check `VRS_AP_Side_Overview.txt` / `VRS_FDD_V4.1.txt` first; they may already cover a candidate. **Do not raise this with Ken on the critical path or ahead of K2/K6/K7.**

---

## 2. Do NOT re-ask — already answered (with source)

| Topic | Resolved | Where |
|---|---|---|
| DMM / GMM approval thresholds | **$250K → DMM, $1M → GMM**; `DMM_APPROVE_TPR=No` | `Ken_answers_4_may12.txt`, `docs/17` |
| FPA-encoded vs FPA-operating | **Design per current use**; no real owner, rotating `FPA_SUPERVIOR` | `Ken_answers_4_may12.txt` |
| Tobacco analyst access | Read-only is **intentional** | `Ken_answers_4_may12.txt` #1 |
| VRS_MKTING / VRS_PRICING / VRS_DAMAGES / MDSE_VENDOR_CONTACTS | Purposes given | `Ken_answers_4_may12.txt` #3/#4 |
| AP access hierarchy | `VRS_ADMIN→VRS_MANAGER→VRS_SUPERVISOPR→VRS_APP_USER` | `Ken_answers_4_may12.txt` #2 |
| Fiscal calendar | **12 periods, 4-5-4**; nothing special at year-end | `Ken_answers_3.txt`, round-3 body |
| Earnings sign | **Negative** (vendor owes DG); ~$949M 2026 | round-3 body, `docs/17` |
| Source codes | B/C/D/E/F/N/P/Q/R/S/T/X (X=Store Transfers, P unused) | `Ken_answers_1.txt` |
| Frequency domain | Full 9-value list | `docs/17`, round-3 body |
| Categories list | ~2,029 (Ad-Coop circular bloat) | `VRS_DATA_ROUND_2.xlsx` Tab 1 (on share) |
| Round-3 data (vendors/programs/per-period counts) | Delivered | `Ken_answers_3.txt` + `VRS_DATA_ROUND_2.xlsx` |
| 1010 access | Not programmatically queryable from VRS; separate IT group | round-3 body, `Ken_followon_questions.txt` |
| Vendor master / Lawson / RSL / Oracle ERP | VENDOR_MST in Lawson via materialized view; RSL stays in Lawson; VRS unchanged | `Ken_followon_questions.txt` |
| RSL/AP/GL interface mechanics | `REBATE_BATCH_FILE`→`_TMP`→shell script→operator upload | `Ken_followon_questions.txt` |
| Roles matrix (15 groups × forms) | Delivered | `DG_Roles_flat.csv`, `docs/14` |
| Tiers tables | `REBATE_TIER` / `REBATE_TIERS`; NSA has none | round-3 body, `docs/16` |
| Subsystem scope (NSA/S5S5/BOPIS/MDSE/Damages) | Catalogued | `docs/16` |
| Accounting Control / GL routing (K3) | **Full real `AcctControlMaster`** — 2,842 rows, 203 rebate_types, RSL/GL/AP routing w/ real account/cost-center values | `VRS_DATA_ROUND_4.xlsx` (on share) |
| `rebate_type` + `acct_type` domains | 203 rebate_types / 16 acct_types — authoritative | `VRS_DATA_ROUND_4.xlsx` |

---

## 3. Suggested delivery

**Already sent (2026-05-16):** the K2–K7 batch went to Ken by email. Note K2 turned out to be largely answered by the data itself (see K2) — Ken's reply on it is now just confirmation.

**Round-5 batch — DRAFTED 2026-05-17, awaiting David to route:** `docs/ken/Ken_data_request_round5.txt` consolidates **D1 + D2 + K8** (the three that make the `docs/21` bubble-index model whole) + **D3** (lower priority) + **D4** (one-line confirm), with **K6** flagged as a Khari-session conversation. Engineering does not contact Ken directly — David sends from the Outlook thread.

**Follow-up batch (superseded by the round-5 draft above):** **K8** (`REBATE_TIER`/`REBATE_TIERS` extract) is the highest-leverage follow-up now that Vera is a central goal — pair it with **K9** (agreement/coverage, if feasible). One short email; both are "if you can extract these too, they'd sharpen the analytics" — explicitly non-blocking so Ken can deprioritize without guilt. **K6** (the uncaptured-opportunity exemplar) remains the highest-value *vision* input — a conversation, best in the Khari pre-demo session, and now directly feeds the central Vera capability. The legacy form spec (§1a) is **not** on any list by design. As always: David routes to Ken; engineering does not contact Ken directly.
