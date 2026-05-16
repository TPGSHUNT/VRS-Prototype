# What We Still Need From Ken — post-evaluation

**Date:** 2026-05-16
**Method:** Every candidate question was checked against `Ken_answers_1/2/3.txt`, `Ken_answers_4_may12.txt`, `Ken_followon_questions.txt`, the round-3 email body, the legacy-Forms screenshots (`docs/17`), the 603-table inventory (`docs/16`), `VRS_AP_Side_Overview.txt`, `VRS_FDD_V4.1.txt`, and `DG_Roles_flat.csv`. Only items that survive that dedup are listed. Companion: `docs/18-demo-gaps.md`.

The recurring lesson from the handoffs: **most "open" questions are already answered somewhere.** §2 below is the do-not-re-ask list — read it before sending Ken anything.

> **Framing correction (2026-05-16).** The demo thesis is a **new frictionless way to see the system**, not Oracle-Forms conversion; DG/Ken/Khari's expectations on that point are moribund and explicitly not the bar (see `docs/18` §0, `docs/11-handoff.md` 2026-05-16 banner). Consequently the legacy-form-spec ask is **no longer demo-critical** and has been moved out of the priority list to §1a. The asks that matter are the ones that make the *vision* land and *correct* (K2, K6, K7, then K3–K5).

---

## 1. Genuinely still open — ordered by demo impact

### K2 — Rebate vs Extract date pairs. **(now largely answered by the data — downgrade to a confirm)**
`REBATE_PROGRAM` on the share carries **all four**: `rebate_beg_date`, `rebate_end_date`, `extract_beg_date`, `extract_end_date`. So the two-pair model is real and we have it. Remaining ask is only **semantic confirmation**: is the rule simply "Extract range usually starts earlier than Rebate range so PMU and Margin both compute in period 1," and are there cases where they're equal or Extract is *later*? Low priority; not blocking — the schema seam (P0.5) already accommodates it.

### K3 — Representative real Accounting Control / GL routing values.
The Accounting Control Master screenshot (`docs/17` image067) shows the Acct Type list and the fixed 10-transaction structure, but the **Account / Offset / Cost Center values are blank** in the capture. For Batch/Distribute to look real we need **6–8 representative real rows** (e.g., for R-COTRKT / S-NSA / N-ADVCOOP / D-SCAN across RSL/GL/AP). *(docs/05 B.3 — still open; not in any answer file.)*

### K4 — Current-system report runtimes. **(supports a "this is faster/less painful" contrast)**
Typical wall-clock runtimes for the main extracts under today's Oracle Reports/rwservlet (e.g., the ~38K-row Rebate Program Extract, a period Batch Detail). Useful as a friction-contrast data point in the vision narrative; not load-bearing. *(docs/05 B.2 — open.)* Also: confirm our report substitutions are acceptable — "Earnings Summary by Merch Type" and "Batch Detail Report" reportedly don't exist; we substituted **Plan-vs-Actual** and **GL Batch**. Ken: are those fair representatives?

### K5 — Single-letter code meanings: Pay Type / Earn Type / SBT Type.
Round 3 gave the Frequency and Pay *value lists*, but the Rebate Program Extract's single-letter columns are still unmapped: **Pay Type** `C/D/G/M/T/W`, **Earn Type** `M`, **SBT Type** `N`. One line each → enum labels. *(docs/05 A.10 — still open; not superseded by round 3.)*

### K6 — One concrete "uncaptured opportunity" example. **(blocks G4 — Vera's headline capability)**
A real, sanitized case where DG missed rebate earnings because an agreement wasn't in place, lapsed, or had the wrong tier structure. Vera's marquee claim ("identifying what doesn't exist") is unfalsifiable and un-demoable without one real exemplar to model the narrative and the detection logic on. *(David asked this in-thread — question #32 — never answered.)*

### K7 — "Active vendor" definition.
Ken gave the count (~2,500 active vendors) but not the **predicate**. What exactly makes a vendor/program "active" (status flag? open rebate in current FY? not expired)? Needed so seed/ingest filters match production semantics. *(docs/05 A.5/Q5 — count answered, definition not.)*

### K8 — `REBATE_TIER` / `REBATE_TIERS` extract. **(sharpens central-goal Vera)**
We have tier *flags* on `REBATE_PROGRAM` (`tier_type/_thresh_type/_calc_type`) but not the actual breakpoints/rates. Vera's "tier under-attainment / wrong tier structure" detector (a co-primary demo capability) is an approximation without them. A CSV extract of both tables would make that detector exact. **Not a blocker** — the proxy works — but high value-for-effort given Vera is now a central goal.

### K9 — Agreement / coverage extract (MDSE side), if extractable.
To let Vera say "the *agreement* lapsed and was never renewed" from agreement records rather than inferring from program `closed_date` + continued activity. Likely hard (separate MDSE side, per Ken). Ask whether any agreement-to-program coverage extract is feasible; if not, we proxy from program lifecycle and move on. Lowest priority of the Vera asks.

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

---

## 3. Suggested delivery

**Already sent (2026-05-16):** the K2–K7 batch went to Ken by email. Note K2 turned out to be largely answered by the data itself (see K2) — Ken's reply on it is now just confirmation.

**Follow-up batch (not yet sent):** **K8** (`REBATE_TIER`/`REBATE_TIERS` extract) is the highest-leverage follow-up now that Vera is a central goal — pair it with **K9** (agreement/coverage, if feasible). One short email; both are "if you can extract these too, they'd sharpen the analytics" — explicitly non-blocking so Ken can deprioritize without guilt. **K6** (the uncaptured-opportunity exemplar) remains the highest-value *vision* input — a conversation, best in the Khari pre-demo session, and now directly feeds the central Vera capability. The legacy form spec (§1a) is **not** on any list by design. As always: David routes to Ken; engineering does not contact Ken directly.
