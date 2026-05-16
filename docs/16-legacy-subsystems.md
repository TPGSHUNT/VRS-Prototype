# Legacy VRS Subsystems NOT in the Prototype Model

**Date:** 2026-05-16
**Source:** `VRS_DATA_ROUND_2.xlsx` Tab 3 "Row Counts" (the real legacy schema: **603 tables, 471 non-empty**) + Ken's round 3–5 / 12–15 May emails.
**Purpose:** The prototype's `prisma/schema.prisma` has **23 models**. The real VRS is ~603 tables organised into a dozen+ named subsystems. This catalogues the subsystems the prototype does **not** represent, so scope decisions are made deliberately, not by omission.

The prototype's 23 models cover roughly: Vendor, RebateType, RebateCategory, Agreement, RebateProgram, RebateTier, RebateVendor, RebateVendorDept, CalculateResult(+Adjustment), Batch(+Item), AcctControlMaster, Check, Deduction, Invoice, User, VendorPortalUser, ReportJob, Notification, AnalyticsSummary, FiscalPeriod. That is the **AP-side rebate-program spine only**. Everything below is outside it.

---

## Tier 1 — Major subsystems, entirely absent from the model

| Subsystem | Tables | Non-empty | Rows | What it is (per Ken) | Prototype status |
|---|---:|---:|---:|---|---|
| **NSA** (National Sales Agreement) | 79 | 72 | 757,067,835 | Per-store, per-SKU calculation driven by New / Remodel / Relocate store lists. Its own subsystem; **no tiers** (store-count driven instead). New Store Allowance alone ≈ $517M/yr. | Flagged Phase 2 in `05-info-needed-from-ken.md`; **not modeled**. `MerchType.NSA` enum value is the only trace. |
| **BOPIS** (Buy-Online-Pickup-In-Store) | 22 | 20 | 889,671,098 | Online-pickup sales & earnings stream (`BOPIS_SALES` 436M, `BOPIS_EARNINGS` 433M, `BOPIS_CALC_DROP` 16M). | **Not mentioned anywhere in existing docs.** Net-new discovery. Unmodeled. |
| **CALCULATE_SKU_*** | 19 | 13 | 2,521,840,631 | SKU-grain extract/calc detail below `calculate_results`. One+ table per source; archived (`_ARC`) after a rebate closes; grows huge. This is the "E" detail of E&C. | Out of scope by design (`05` §D confirms no Receipt model); but it is the substrate Vera's uncaptured-opportunity detection would need. |
| **FPA forecast** (Forecast & Planning) | 53 | 22 | 48,981,387 | MDSE-side forecasting/planning (`FPA_FCST_AGMT_DTL` 22M, `FPA_FCST_PROGRAM` 18M). FPA designed the MDSE side, then abandoned it; now rotating-support. The `Agreement.estimatedValue`/"Forecast" that drives DMM/GMM thresholds originates here. | **Not modeled.** Directly relevant: approval-threshold logic depends on Forecast. |
| **MDSE side** (`MDSE_AGMT_*` 23 tbl/100M + `MDSE_*` 55 tbl) | 78 | 61 | ~101,682,178 | The Buyer-facing agreement-authoring system. Ken: *"think of the MDSE side and the AP side as if they are separate systems"* — separate period close ("Cycle" vs AP "Finalize"), separate security layer (insert/modify control). | The prototype's single `Agreement` model is a thin stand-in for this entire half of VRS. |
| **S5S5** | 21 | 14 | 47,784,277 | A distinct promotional-structure subsystem (`S5S5_1010_DATA` 38M). | `MerchType.S5S5` enum value only. Subsystem unmodeled. The bubble-field `estimatedValue` axis is "only meaningful in S5S5" per handoff §4. |

---

## Tier 2 — Significant subsystems, absent or only enum-deep

| Subsystem | Tables | Non-empty | Rows | What it is | Prototype status |
|---|---:|---:|---:|---|---|
| **Damages / Unsaleables** (`REBATE_DMG` 7 + `DMG` 2 + `UNSALE` 16) | 25 | 22 | ~49,261,670 | "Unsaleables (aka Damages) Sub System." Damage Contracts have their own PKs. `VRS_DAMAGES` is a new security group opening one button on one Damages form (1 user). | Unmodeled. |
| **Bill-Back contracts** (`BB_CONTRACT` 5 + `BB_*` 16) | 21 | 19 | ~74,081,322 | `BB_CONTRACT_CALC_DETAIL` 60M. A contract-calc stream separate from rebate programs. | Unmodeled; not in docs. |
| **VRS_DISCOUNT(_EXT)** | 3 | 2 | 1,261,382,348 | Source `C` Discount/BOGO feed. ~630M rows each; cf. memory: ~600M-row/day discount feed from 1010. | Source enum `C` only; volume substrate unmodeled. |
| **VRS_SALES / SALES_SUMMARY** | 6 | 6 | ~3,052,940,415 | Sales source feeds + 1.5B-row `SALES_SUMMARY`. | `AnalyticsSummary` is a 562-row synthetic mock of this. |
| **RECALCULATE_*** | 6 | 5 | 27,919,567 | Recalculation pass (re-running E&C). | No recalc concept in prototype status machine. |
| **REBATE_AUDIT_LOG(_ARC)** | 2 | 2 | 189,951,648 | 184M-row archived audit log. | Prototype has thin per-row `*By/*At` audit fields only. |
| **TPR** | 2 | 2 | 1,589,048 | Temporary Price Reduction agreements. Pricing dept (`VRS_PRICING`) authors these on the MDSE side and pulls prices out for them. DMM-approval-of-all-TPR was disabled via a Parameter. | `MerchType.TPR` enum value only. |
| **Ad Coop / AD_FUND** | 2+ | 2 | 15,777+ | Advertising co-op — the one surviving "Ugly Sister" (other two dead-but-present). Marketing (`VRS_MKTING`, 1 user) uses it. Cause of the 2,029-row Category bloat (a category per Ad Coop). | `advcoopEarnings` column + `MerchType.ADVCOOP` only. |
| **Freight** | 6 | 5 | 14,206 | Source `F`. | Source enum `F` only. |
| **Weekly deduction** (`WEEKLY_*`) | 2 | 2 | 366,634 | Ken: weekly deduction process "shoe-horned" into a period-based system; one deduction per week. | Frequency concept not modeled. |
| **Tobacco** | 8 | 8 | 207,423 | Special-handled category; analyst Tobacco access is intentionally read-only (Ken confirmed). | Unmodeled. |
| **DGM / DGM2** | 24 | 22 | ~1,071,161 | Likely DG Market (the grocery-format banner) — separate calc tables. | Unmodeled; unconfirmed meaning. |

---

## Tier 3 — Outbound interfaces & infra noted elsewhere

- **Gold + Treasury** — per memory (`project_vrs_on_rsl_db_colocation`), previously-missing **outbound** interfaces. No `GOLD_`/`TREASURY_` prefix surfaced in the row-count grouping; they may be view/package-based rather than tables, or named differently. Flagged for confirmation, not yet located in the 603-table list.
- **REBATE_ATTACHMENTS** — BLOB store for agreement attachments; migrated out of SharePoint years ago (rendering was easier in SharePoint). Not modeled (prototype has no document store).
- **ACCT_CONTROL_MASTER family** — real shape is `ACCT_CONTROL_MASTER` (27) + `_DETAIL` (378) + `_FUNCTIONS` (14). Each Acct Type carries **10 numbered Transactions/Functions** (4→RSL, 5→GL, 1→AP). The prototype's flat `AcctControlMaster` (28 rows) collapses this 3-table structure.
- **Parameter table** — DMM/GMM approval thresholds, TPR-approval toggle, check-pay exclusion vendor list are all Parameter-driven. No Parameter model in the prototype (approval rules are hardcoded assumptions).

---

## Implications

1. The prototype is a faithful slice of the **AP-side rebate-program spine** and nothing else. Demonstrating it as "VRS rebuilt" overstates coverage; framing it as "the AP rebate workbench + Vera" is accurate.
2. **NSA, BOPIS, MDSE-side, FPA forecast, Damages, Bill-Back** are each large enough to be their own projects. BOPIS and Bill-Back were not previously on anyone's radar.
3. Approval-threshold realism (handoff open item A.5) is blocked on the **FPA forecast** + **Parameter** subsystems, not just a number from Ken.
4. The IT-audience claim ("convert your Forms inventory") is **strengthened**, not weakened, by this: ~603 tables and dozens of forms is exactly the conversion-scale story — provided the demo is honest that the prototype shows the method on one subsystem, not the whole estate.
