# Legacy VRS — Emailed Image Catalog

**Date:** 2026-05-16
**Decision:** Images are **not stored in the repo**. They live in Outlook and are re-pullable on demand. This catalogs what each meaningful image shows so the binary only needs fetching when actually required.

## How to re-pull

The `Ken-VRS` Outlook folder is local-only and does not resolve server-side. Use the Microsoft 365 MCP:
1. `outlook_email_search` sender `kbanks@tpg-partners.com`, mailbox `djurk@tpg-partners.com`.
2. The two image-bearing emails are both **"RE: Outstanding Questions"**: **2026-05-08 18:10** (~56 images + `VRS_DATA_ROUND_2.xlsx`) and **2026-05-11 14:07** (~55 images + `VRS_diagrams1.vsdx`).
3. `read_resource` the message → `attachments[]` gives per-image `name` + `uri`; `read_resource` the image `uri` renders it.

The two emails carry **the same screenshot set**; May 8 names are used as canonical below. May 11 re-numbers them (`image007`–`image055`) and adds the Visio. Image names are **not stable across fetches of different messages** — match by content, size is a good discriminator.

---

## A. Legacy Oracle Forms screenshots (highest value for the rebuild)

| Ref (May 8) | Form (title bar) | What it shows |
|---|---|---|
| `image067` (591 KB) | **Accounting Control Master — (2026) Fix 694** | Acct Type list (ANALY "DGMN Analytics Non-Endemic", AUDCY "Post Audit Current Year", AUDPY, Acct1 "Rebate Accounting-DC", Acct2 "Rebate Accounting-Store", Acct3 "Rebate Accounting-Adv/Coop", COUPN "Coupon Income"…). Lower grid = the **10 fixed Tran#**: 1 PMU/Reclass/RSL, 2 PMU/Accrual/RSL, 3 Margin/Reclass/RSL, 4 Margin/Accrual/RSL, 5 AdvCoop/Reclass/GL, 6 AdvCoop/Accrual/GL, 7 OtherCoop/Reclass/GL, 8 OtherCoop/Accrual/GL, 9 Deductions/Prepaid/AP, 10 Checks/Received/GL. Columns: Account, Offset, Cost Center, Offset, Reverse Sign, Entry. **This is the real `AcctControlMaster` shape** — fixed 10-transaction routing, not the prototype's free combinatorial table. |
| `image057` (424 KB) | **Period Accounting Transaction Summary — (2026) Fix 708** (Mdse) | Search: Rebate ID, AP #, Category, Rebate Type, Merch Type, Dept #, Periods 1–12, Year, Mdse/NonMdse/Both, SBT Type All/SBT/NonSBT, Rebates Only, Distributed Only. Grid rows PMU/Margin/NonMdseCY/NonMdsePY/AdvCoop/OthCoop/Total × cols Reclass/Accrual/**Reversal**/Subtotal/Total. **2026 Mdse Total = −949,122,556** (negative = vendor owes DG; confirms bubble bug #1 and Ken's "$950M" figure). |
| `image058` (408 KB) | same form, **Non Mdse** radio | Non-Mdse only: NonMdseCY/PY rows populated, Total ≈ −8.3M. Confirms the Mdse vs Non-Mdse split (<0.1% of volume per Ken). |
| `image061` (402 KB) | **Security — (2025) Fix 522** | Group list (VRS_ADMIN, VRS_ADMIN_RO, VRS_APP_USER, VRS_DAMAGES, VRS_MANAGER…), AP/Mdse toggle, "Types of Authorization: 1 Maintenance=full, 2 Read Only, 3 No Access (greyed on menu)". Per-form auth rows: Rebate Program-AP, Invoices, Treasury Invoices, Extract and Calculate, Review Calculations, Approve Calculations, Batch and Distribute, Period Acct Summary, Uploads, Attach Multiple. The real menu-level security model behind `DG_Roles_flat.csv`. |
| `image062` (75 KB) | Security-group-by-form **report export** | Columns RESPON_NAME / RESPON / PERSON_NAME / AUTH_ / USER_NAME_. Shows `VRS_ADMIN (AP)` held by **areidl, lscoggin** only (matches Ken: "only Lane and Amy have VRS_ADMIN"), AUTH `M` per form (1010 Dashboard, AP Approval Queue, Accounting Control Master, …). |

## B. Parameter / config screenshots — these answer open questions

| Ref (May 8) | Shows | Resolves |
|---|---|---|
| `image053` (28 KB) | **Parameters** form: `MDSE_THRESHOLD` seq 1 = "DMM Agreement Threshold" = **250000**; seq 2 = "GMM Agreement Threshold" = **1000000** | **Open item A.5 / handoff approval thresholds: DMM ≥ $250K, GMM ≥ $1M.** Was unknown/synthesized. |
| `image054` (23 KB) | **Parameters — (2025) Fix 638**: `DMM_APPROVE_TPR` seq 0 = **No** | Confirms Ken: DMM-approval-of-all-TPR is disabled via Parameter. |
| `image087` (28 KB) | Frequency dropdown values: Begin of Rebate, Calendar Quarter, End of Rebate, Calendar Month, Custom, Period, Quarter-in-Arrears, Quarter-in-Advance, Weekly | The real billing **Frequency** domain (supersedes guesses). |

## C. ERDs (Ken's "slimmed, not complete" diagrams)

| Ref (May 8) | Shows |
|---|---|
| `image003` (68 KB) | **"Rebate Program Tables"** ERD. Center `REBATE_PROGRAM(REBATE_ID)` → `REBATE_VENDOR(REBATE_ID,VENDOR_NUM)` → `REBATE_VENDOR_DEPT(+DEPT_NUM,CLASS_NUM)` → `CALCULATE_RESULT(REBATE_ID,VENDOR_NUM,DEPT_NUM,CLASS_NUM,PERIOD,YEAR)`. Also REBATE_TYPES(FUNCTION)→ACCT_CONTROL_MASTER/_DETAIL/_FUNCTIONS, REBATE_SOURCE, REBATE_DC, REBATE_STORE, REBATE_SKUS, REBATE_CLASSES, REBATE_ADJUSTMENTS, REBATE_CHECK_RECV, REBATE_DEDUCTIONS, REBATE_INV_HEADER/_DETAIL/_DETAIL_NSA/_DETAIL_BAL, REBATE_CATEGORY_TYPES/_RPT, REPORT_TYPES. **Real natural key is composite (REBATE_ID, VENDOR_NUM, DEPT_NUM, CLASS_NUM, PERIOD, YEAR)** — the prototype's UUID surrogate keys are a modeling choice, not the legacy reality. |
| `image096` (17 KB) | Detail inset: `ACCT_CONTROL_MASTER(ACCT_TYPE)` → `ACCT_CONTROL_MASTER_DETAIL(ACCT_TYPE,FUNCTION)` → `ACCT_CONTROL_MASTER_FUNCTIONS(FUNCTION)` — the 3-table structure the prototype's flat `AcctControlMaster` collapses. |

## D. Ken's term-definition cards (context, low rebuild value)

| Ref (May 8) | Content |
|---|---|
| `image085` | "SBT = **Scan-Based Trading**" — supplier retains inventory ownership until POS scan. |
| `image099` | "**pOpshelf**" — DG's 2020 upscale-dollar-store concept brand. |

## E. Not catalogued (intentionally)

- ~30 small images (2–13 KB): email-signature logos, spacers, and repeated UI chrome.
- A series of numbered `MED/HIGH/LOW` boxes (`image066`=#12 agreement_id sparseness, `image089`=#18 service-account userids, `image074`=#21 real human userids, `image063`=#22 1010 access plan, `image076`≈#?, `image081`=David's "what I learned" summary, `image082`-region varies, `image087`-region) — these are **David's own question list echoed back in the thread**, not Ken-authored reference. Captured already in `docs/08/13-questions-for-ken*.html`. One of David's items (#32) names Vera's headline capability as "uncaptured opportunity / identifying what doesn't exist."

## F. Visio (not yet opened)

`VRS_diagrams1.vsdx` (~96 KB) on the **May 11 14:07** email. Body: *"Data sources that are not owned by VRS are still accessed via the RSL Database."* Corroborates `project_vrs_on_rsl_db_colocation`. Needs a manual save + Visio/converter to read (MCP renders images, not `.vsdx`). Flagged, not done.
