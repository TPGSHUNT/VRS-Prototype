# Ken Commentary in Emails and Files

**What this is.** A consolidated, faithful summary of the explanatory content
**Ken Banks** (kbanks@tpg-partners.com — original Dollar General VRS author)
has provided, drawn from **(a) the files he supplied** and **(b) his full
email correspondence** (31 messages, 2026-04-08 → 2026-05-16). Every
non-trivial point is attributed to its origin. Raw extracts are preserved in
`docs/ken/source/*.txt` and `docs/ken/Ken_answers_*.txt`; the email bodies
live in Outlook (sender `kbanks@tpg-partners.com`).

**Authority note.** Ken is the domain authority on *how legacy VRS actually
behaves* — trust this document on that. He is **not** the authority on the
rebuild architecture or DB portability (memory `project_ken_role_boundary`).
The TPG positioning docs in the corpus (`VRS_Analysis_and_Architecture`,
`VRS_Role_Lens_Vera`, `VRS Summary for Executives`, `vrs-architecture-vera`)
are **partly factually wrong** about legacy VRS — see §10.

**Source shorthand.** *Files:* Intro = `VRS_Introduction` (≡
`VRS_Training_Session_1`); APCalc = `AP_Calc_Overview`; FEO =
`ForecastEngineOverview`; APSide = `VRS_AP_Side_Overview` (the long, most
authoritative AP training guide); FDD = `VRS_FDD_V4.1` (2010 MDSE design doc —
*design intent, not current behavior*); KA1–4 = `Ken_answers_1/2/3/4`;
KFollow = `Ken_followon_questions`; Delegates = `VRS Delegates`. *Emails:*
cited as (email, YYYY-MM-DD).

---

## 1. What VRS is

VRS tracks, calculates, and records **vendor rebates** — money vendors pay DG,
usually performance-based — plus other contractually-agreed vendor monies, so
"not everything in VRS, strictly speaking, is a Rebate" (Intro).

**Two sides, one DB and menu, treated as separate systems.** Ken is emphatic:
*"think about the MDSE side and the AP side as if they are separate systems"*
(KA2/3; email 2026-05-08/09).

- **MDSE side** — Buyers / delegates / DMMs / GMMs + FPA. Creates/maintains
  **Agreements** (the contractual record) and runs FPA forecasting. Driven by
  **Merch Type**.
- **AP side** — AP analysts. Maintains **Rebate Programs**, calculates
  **Earnings**, interfaces results out to RSL/AP/GL. Driven by **Source**.
  *"It is the AP Side's data that really has the complete picture in terms of
  Earnings"* (Delegates; KA1).
- **Approval Queue** ("Acct Approval Queue") is the only bridge: it **turns
  Agreements into Rebate Programs** (Intro; email 2026-04-08, which corrected
  an earlier wrong "Queue → Calculations" diagram).

Other components: a vendor-facing **Portal** (Java/Tomcat, outside firewall,
small subset of Merch Types, separate shadow tables) and **Linux + 1010
scripts via the Opcon scheduler** (Intro). **Subsystems (AP side):** Damages
(Unsaleables), NSA (New Store Allowance), S5S5 (Spend 5 Save 5), DG Media,
BOPIS, Customer Bounceback — each may have its own calc engine but deposits
into an **N – No Source** rebate program (APCalc; APSide).

---

## 2. Core data model & keys

- **Two vendor numbers, side-dependent canonicity** (email 2026-05-01;
  KA1): AP `VENDOR_NUM` VARCHAR(9) digits-only (screen "AP #") is canonical
  **AP-side** and in primary keys; `IP_VENDOR_NUM` NUMBER(5) (Island Pacific,
  screen "IP #") is canonical **MDSE-side**; **1:1 in VRS**. System of record
  is Lawson / Island Pacific, **not VRS**. Many master rows have no IP#.
- **`REBATE_ID`** is a plain Oracle sequence, **NUMBER(10)**; VRS *is* SOR for
  it (email 2026-05-01).
- **Vendors are grouped/reported by NAME, not number** — a vendor can hold
  multiple AP#s; *"the only way this grouping is done today is by giving two
  vendors exactly the same name"* (email 2026-05-05; KA1). Oracle ERP's
  name-uniqueness rule **breaks even that** — a known AP problem. Do not treat
  a clean vendor PK as authoritative grouping.
- **Agreement ≠ Rebate Program (NOT 1:1)** (Intro, starred lines; email
  2026-05-05): `AGREEMENT_ID` is stored **on `REBATE_VENDOR`**; Rebate ID is
  **not** on the Agreement. *"It is the Rebate Program's Vendor that is aware
  of the Agreement, not the other way around."* Many programs (all subsystem
  output — NSA, DG Media, BOPIS, S5S5, Customer Bounceback) have **no
  Agreement at all**; *"the Agreements in the MDSE side do not even come close
  to representing a complete picture"* — the stated reason FPA abandoned the
  MDSE side (KA1).
- **Three-level hierarchy** (APCalc; APSide): `REBATE_PROGRAM` (PK
  `REBATE_ID`; carries **Source**, locked at creation) → `REBATE_VENDOR` (+
  `VENDOR_NUM`; **Agreement tied here**; Frequency/Pay/Earn type) →
  `REBATE_VENDOR_DEPT` (+ `DEPT_NUM`,`CLASS_NUM`). **`CLASS_NUM` is always
  −1** — Class level *was never implemented*; every row is effectively
  Dept-level. Optional `REBATE_CLASS/SKU/STORE/DC` override bottom-up.
- **Five dates on `REBATE_PROGRAM`** (email 2026-05-16, refining the earlier
  two-range description): Extract Begin/End, Rebate Begin/End, Closed Date.
  Extract range usually starts earlier so prior-year earnings land in
  **Margin**; Closed Date NULL until fully finalized.
- **Earnings: 4 components, naturally NEGATIVE** (negative = DG earned it)
  (email 2026-04-30 "Earnings are expressed in Negative numbers"; APCalc):
  **PMU** (Purchase Mark Up — most earnings; into Gross Profit), **Margin**
  (prior-year earnings recognized late — **Buyers get 100% of Margin**),
  **Adv Coop** (vendor pays DG the ad's cost), **Other Coop**. *Adv/Other Coop
  route to **GL**, not RSL — the `RSL_ADV_/RSL_OTH_` field names are
  misnamed* (APSide). Checks/Deductions entered negative; reducing earnings
  via an Adjustment uses a **positive** amount (APSide).
- **Source** (`REBATE_SOURCE`, not app-maintainable; new source = "tremendous
  modification"): Sourced = R/S/D/B/F/C/P; No Source = N/E/Q/T; **X** = Store
  Transfers (recent; "used some"); **P** ("never been used") (KA1; APCalc).
- **Rebate Type** is what you actually pick — it bundles **Source + Merch
  Type + Accounting**; must be unique by Merch Type + Source when "Used by
  MDSE" (KA1; APSide). ~150+ in production.
- **Category** is a pure grouping field, *massively* bloated because the MDSE
  side inserts one per Ad-Coop/Ad-Event — Ken: *"mind-numbingly stupid
  decision … I did not have control over how the MDSE side was designed"*
  (KA1).
- **Tiers** (`REBATE_TIER`/`REBATE_TIERS`): 4 types — Pre-Defined Ranges (no
  true-up), Pre-Defined Levels (true-up), Growth (true-up, needs prior-yr
  YTD), Excess (no true-up). Allowed on Sourced **except Discount/BOGO and
  Store Transfers**; **NSA can never have tiers** (email 2026-05-01; APSide).
- **Cap on Earnings:** performance rebates can over-earn; the Rebate/Vendor is
  capped at a max the vendor will pay (KA1).

---

## 3. The engines — Extract vs Calculate, Forecast, Batch/Distribute/Finalize

- **Extract and Calculate are TWO SEPARATE processes** (Ken stresses this
  repeatedly — email 2026-05-07; APCalc; KA1). **Extract** works at the
  **Rebate level** (pulls external data into source-specific `CALCULATE_*`
  detail tables). **Calculate** works at **Rebate/Vendor/Dept** level and is
  what **inserts `CALCULATE_RESULT`**, via `CALCULATE_BUCKETS` ("the most
  pivotal function"). One Extract → many Calculations. *"Extract" is
  overloaded:* a CSV-only Oracle Report **vs.** the E in E&C (email
  2026-05-16). Nightly E&C by source via **Opcon**, ~8 PM→4 AM; worst case is
  a Sales rebate with Stores (billions of rows).
- **`CALCULATE_RESULT`** is *"the most important table in the whole of the AP
  side"* (email 2026-05-05; APCalc). Unique key (REBATE_ID, VENDOR_NUM,
  DEPT_NUM, CLASS_NUM=−1, YEAR, PERIOD). **SBT (Scan Based Trading)** tripled
  the fields: `SBT_x + NSBT_x = x`; original fields default 0, SBT/NSBT do
  not. Best earnings = `SUM(CURR_PMU+MAR+ADV+OTH + their _EADJ)` (APCalc).
- **Calc state machine** (the calc, not the program): Calculated → Reviewed →
  Approved → Batched → Distributed. Reversible up through Batched; **locked
  once Distributed** (`SENT=Y`) (Intro).
- **Batch / Distribute / Finalize** (APSide): Batch uses the Accounting
  Control Master (3 tables; each Acct Type has 10 functions = 4 RSL / 5 GL /
  1 AP). VRS **no longer writes physical files** — rows go
  `REBATE_BATCH_FILE → _TMP`, a Linux shell script builds the file, an
  Operator runs the upload after a VRS email (RSL is tighter — VRS invokes an
  RSL upload routine) (KFollow; email 2026-05-09). **Finalize** = AP period
  close: Move-to-History (stamps real YEAR/PERIOD), update YTD/LTD buckets,
  close past-end programs, roll the period, Quick-Calc, then Class/SKU
  allocations (moved here end-2018 — so they don't exist for a period until
  *after* Finalize), archive. Known bug: Unclose→reclose loses archived data.
- **Forecast Engine (MDSE)** (FEO): the FPA *department* abandoned it, but it
  is a **live ~53-table subsystem still driving DMM/GMM thresholds** — "FPA
  unused" is an ownership statement, not dead code. 4 Agreement Groups; 4
  Forecast-Tool forms; Merch/Period/Reallocation methods; runs at Cycle Close.

---

## 4. Period & calendar, sign, YTD/LTD

- **12 periods/year, 4-5-4** (P1=4wk, P2=5wk, P3=4wk = quarter end). *Nothing
  special at year end.* This **corrects the earlier 13-period / 4-4-5
  assumption** (email 2026-05-08/09; KA2/3).
- **Open-period sentinel: `YEAR=0, PERIOD=0`** in CALCULATE_RESULT; real
  year/period stamped only at Finalize/Move-to-History; current data mutable
  until Distributed (Intro; APCalc; KA round-5 confirm pending).
- Dates ~99% `SYSDATE`, server-local, no conversions (KA2/3).
- **YTD/LTD tracked at Rebate/Vendor/Dept; convention differs by location** —
  REBATE_VENDOR_DEPT buckets are **through prior period (exclude current)**;
  CALCULATE_RESULT review/approve fields **include current period**. A real
  trap for any earnings rollup (APSide; email 2026-05-05).
- **Two period closes, a week apart, as separate systems:** AP **Finalize**
  first (~1 wk after period end), MDSE **Cycle Close** the week after.
  Systematic Deductions almost always post to the *next* period (float cost →
  heavy On-Demand-Deduction use) (email 2026-05-08/09; APSide).
- Scale (KA3): ~2,500 active vendors; **7,665 active rebate programs**;
  CALCULATE_RESULT ≈ 30K–52K rows/period. Non-MDSE < 0.1% of $ (2026 YTD
  $950M MDSE vs $8M Non-MDSE).

---

## 5. Interfaces & data flow

- **VRS primarily interfaces to RSL, AP, GL** (email 2026-05-09).
  - **AP** = **Lawson AP** — being replaced by **Oracle ERP** (the main DG
    project). VRS sends **Deductions**; "very loose interface."
  - **GL** = General Ledger ("I think part of Lawson"). VRS sends **Coop**.
  - **RSL** = Retail Stock Ledger, part of **Lawson, stays in Lawson**. VRS
    sends **Accruals + Reclasses**; tighter (VRS invokes an RSL routine).
- **Sister data** (Sales/Receipts/Dropship/Vendor Master) **resides on the
  RSL database where VRS resides, in different schemas** — VRS *pulls* it
  (direct if on RSL, else via Views/MVs in the controlled **`DATA_FEEDER`**
  schema; VRS's own schema = **`REBATE_OWNER`**). This is **schema
  extraction, not a replatform** (email 2026-05-11). **VENDOR_MST** is in
  Lawson, read via a **materialized view**; under Oracle ERP it bifurcates
  (active→Oracle, historical→Lawson) "and VRS will not notice."
- **1010 (1010data) CANNOT be queried from VRS** — independent cloud DB, own
  query interface, owned by another IT group; to use its data it must be
  pulled out and shell-loaded into VRS tables. **~600M rows/day** are
  batch-loaded from 1010 for the Discount/BOGO source; NSA uses several 1010
  feeds. Tendo (the old mover) is no longer usable. AP runs **ad-hoc 1010
  queries "A LOT"**; a couple of depts use **Alteryx**. 1010 is **rumored for
  retirement** (email 2026-05-05/08/11/12; KA2/3).
- **Previously-unlisted outbound interfaces** (email 2026-05-11): the **Gold
  System** pulls VRS pricing via views; a **Treasury** system picks up
  VRS-loaded Treasury invoice data. Add both to any interface list.
- **No comprehensive architecture/interface diagram exists** — Ken: VRS "was
  developed piecemeal over many years and … the thing that suffered the most
  from … cost cutting was documentation." Only high-level Visio + a slimmed
  ERD were provided (KFollow; email 2026-05-09/11).

---

## 6. Roles & security

- **No login screen — SSO only.** An Oracle function returns the SSO id; VRS
  looks up the user's **Security Group** in external **`VRS_SECURITY`**
  (email 2026-05-08/09; APSide). (Aligns with the no-login seat-switcher
  decision, memory `project_no_login_seat_switcher`.)
- **Menu-Level Security:** per group × menu form = Maintenance / Read-Only /
  No-Access (Read-Only still sees everything on the form). Each group is an
  **AP** or **MDSE** group. The MDSE side has an *additional lower layer*
  governing who can Insert/Modify an Agreement.
- **15 real security groups** (DG_Roles_flat.csv; KA4) — not the simplified
  TPG 7-role table. AP **informal** descending hierarchy: `VRS_ADMIN →
  VRS_MANAGER → VRS_SUPERVISOR → VRS_APP_USER` (not derivable from data;
  "almost everyone does the analyst job, some have more authority").
  `VRS_ADMIN` = only ~2 people (Lane, Amy). Plus VRS_MKTING / VRS_PRICING /
  VRS_DAMAGES / VRS_MDSE_BUYER / DMM / GMM / FPA / FPA_SUPERVISOR /
  MDSE_VENDOR_CONTACTS. **Tobacco subsystem is intentionally restricted to
  VRS_SUPERVISOR+** (email 2026-05-11/12).
- **Approval / "Move Forward"** (Intro; KA1/4): created in VRS →
  Pre-Negotiation; via Portal → Submitted by Vendor. Forecast **> $250,000 →
  DMM**, **> $1,000,000 → GMM (after DMM)** (2026 Parameter values;
  `DMM_APPROVE_TPR = No`). **The 2010 FDD's $75K / TPR-always-DMM is
  superseded** — see §10. Check-paying domestic vendors not on the exclusion
  list force DMM regardless of amount. AP-side direct programs **do not** go
  through MDSE approval — "AP has the ultimate say."
- **Delegates** (Delegates; FDD): buyers/DMMs/GMMs have delegates who do most
  of the actual work; a delegate may support several buyers. An **"Ok to Move
  Forward"** flag decides whether a delegate's Move-Forward parks at "Pending
  Buyer Approval" or pushes straight on.

---

## 7. Ownership / assignment — what Ken explicitly says (resolves a live question)

This was an explicit point Ken corrected; it directly answers the bubble-field
"cluster by analyst" question.

- **Created-By / Updated-By are research-only audit fields, NOT assignment**
  (email 2026-05-08/09): *"They are for research. Sometimes they contain a
  real user's id or sometimes the name of a process … There is not a full
  list anywhere."* **Never infer ownership from these columns.** (This is why
  the prototype's cluster-by-analyst showed "Batch Exec", "Upload", etc.)
- **The AP side has NO analyst→program/vendor assignment** (email
  2026-05-11): *"this type of assignment does not occur on the AP Side.
  Agreements have specific Buyers assigned to them but AP has no such concept
  with respect to Analyst and Rebate Programs."* AP work is split *softly* by
  **Merch Type** with Category overrides, but **any analyst can work any
  rebate** with no reassignment. Mechanically this is a **Merch-Type-level
  `ANALYST` initials attribute** (`REPORT_TYPES.ANALYST`, Parameter seq −400
  class overrides, DB fn `GET_ANALYST`) — *not* a stored owner FK on
  program/vendor/calc (APSide).
- **The MDSE side DOES have real ownership** (email 2026-05-11): *"Only
  Buyers or their Delegates can create an Agreement. A buyer can only create
  an Agreement for himself. A Delegate can only create Agreements for Buyers
  that they are Delegates of."* FPA gets made delegate-of-all-buyers.

**Engineer takeaway:** model **Buyer↔Agreement** ownership (with Delegate
proxy) as real on the MDSE side. Treat **AP "analyst ownership" as a soft
Merch-Type/Category work-split** (derive via Merch-Type→analyst-initials),
never from Created/Updated-By, and never as a hard per-program assignment.

---

## 8. Ken's strategic / perspective commentary

- **Demo audience & pitch** (email 2026-05-04): *"The people you will
  demo'ing to are IT people. To them VRS is a burden … What IT wants is to
  get rid of Oracle Forms and Reports … If you can convince them that you can
  convert the existing forms and reports in a reasonable amount of time and
  for a reasonable amount of money, then I think they will be interested."*
  **(Per memory `project_demo_thesis` this form-conversion framing is
  treated as moribund/superseded — recorded here for fidelity, not as the
  bar.)**
- **Khari/Jay expectation** (email 2026-04-30): a demo of *"a fully
  functioning, code ready, VRS form … converted using AI."* (Same — noted,
  not the bar.)
- **What management cares about** (email 2026-05-04/05): Forecast-vs-Actual,
  but MDSE forecasting omits NSA etc. so it's incomplete; they think in
  **Merch Types**; *"Annual Earnings is the one that is the most
  important."* Weak preference: vendor "size" on the horizontal axis.
- **AP's real pain = performance** (email 2026-05-08/09): *"the top 3 issues
  are: Performance, Performance and … Performance. AP spends an enormous
  amount of time verifying and double checking … Calculations … Anything that
  would improve the time it takes … would be of great benefit."*
- **MDSE is fragile / no owner** (email 2026-05-08/09; KA4): FPA designed it
  (designer left the week it went live), abandoned it, "stuck supporting it"
  via a rotating FPA_SUPERVISOR; most reported "bugs" are misunderstandings;
  *"When I am gone, support for the MDSE side will suffer a lot."* *"This is
  why you do not let Business people do the design."*
- **Origin story / grounded uncaptured-opportunity example** (email
  2026-05-16): VRS exists because vendor contracts were *"shoved into
  someone's desk and forgotten about only to be found months later"* — the
  origin of **Margin**, and why Buyers must now enter agreements. The **NSA
  overhaul**, re-run historically, *"picked up millions of dollars"* — Ken's
  own concrete example of recoverable missed earnings.
- **His wishlist** (email 2026-05-08/09): direct 1010 access; a
  user-updatable help/business-scenario system.
- **Modernization scope** (email 2026-05-09): *"The main project is the
  replacement of Lawson AP with the Oracle ERP. Everything is being done so
  that VRS itself does not have to change."* RSL stays in Lawson; Vendor
  Master bifurcation already solved behind the MV. (Memory
  `project_dg_modernization_scope`.)

---

## 9. Data Ken delivered (provenance)

- **VRS_Vendors.xlsx** (2026-04-30) — vendor list; earnings negative.
- **Round 1** — `VRS_DATA_ROUND_1.xlsx` (Departments / Classes / FY2025
  Periods) + `TierOverview.docx` (2026-05-01).
- **Round 2 (reports)** — `RebateProgramExtact.zip`, `UnapprovedExtract.csv`,
  `ResceiptsHistory.csv`, `ActVrs_Plan.csv` (substitute for the nonexistent
  "Earnings Summary by Merch Type"), `gl_batch.csv` (substitute for the
  nonexistent "Batch Detail Report") (2026-05-01).
- **Production share dump** (2026-05-05) — REBATE_PROGRAM / REBATE_VENDOR /
  REBATE_VENDOR_DEPT / CALCULATE_RESULT_2024-26, Jan 2024→present. **DEV DB
  last loaded 2022 — do not use; all provided data is production.**
- **Round 3** — counts (~2,500 vendors / 7,665 programs); spreadsheet
  **misnamed `VRS_DATA_ROUND_2.xlsx`** on the 2026-05-08 18:10 email (naming
  error, not missing — memory `project_round3_attachment_location`, now
  retired as resolved).
- **Round 3 / security** — `VRS_DATA_ROUND_3.xlsx` (Security Groups by form +
  authorization) + `MDSE_Side_Users.docx` (2026-05-11/12).
- **Round 4** — `VRS_DATA_ROUND_4.xlsx` (Accounting Info by REBATE_TYPE —
  the real AcctControlMaster, since ingested) (2026-05-16).
- Docs: `VRS_Introduction`, `VRS_AP_Side_Overview` (2026-04-08); high-level
  Visio diagrams (2026-05-11).

---

## 10. Contradictions, caveats, open deliverables

- **TPG positioning docs are partly wrong about legacy VRS.**
  `VRS_Analysis_and_Architecture` carries a 2026-05-16 correction banner.
  False as written: "1010 as a first-class/read-replica data source" (Ken:
  1010 unreachable from VRS); "FPA module unused → swap for 1010 forecast"
  (FPA forecast is a live ~53-table subsystem driving thresholds); the 7-role
  table (real = 15 groups); 13-period/4-4-5 calendar (real = 12 / 4-5-4).
  Their *friction inventory and workflow-first philosophy* remain useful.
- **FDD (2010) vs 2026 reality:** FDD says **$75K DMM threshold, TPR-always-
  DMM**; current Parameters say **$250K DMM / $1M GMM, `DMM_APPROVE_TPR=No`**.
  Use the 2026 values. Treat the FDD as *structure* (data model, status
  flows, Forecast Tools), not current rules.
- Other drifts: `CLASS_NUM` always −1 (Class never implemented); Accrual-
  Adjustment batch effectively dead; Category explosion; Weekly / End-of-
  Rebate / user-defined frequencies bolted on later; Pay Type **G = DGCS**
  ("not sure what this means" — Ken's own gap).
- **Dual YTD/LTD convention** (see §4) — easy to get wrong.
- **Ken's own self-corrections, chronologically:** Queue→Programs not
  →Calculations (04-08); no "Earnings Summary by Merch Type"/"Batch Detail"
  reports (05-01); NSA can never have tiers (05-01); the 1010-vs-Oracle story
  clarified over three emails (05-05); interface list expanded with **Gold +
  Treasury** (05-11); date model refined to **five dates** (05-16).
- **Biggest open deliverable Ken owes:** a **consolidated integration /
  architecture document** — repeatedly implied, never produced (it does not
  exist; documentation was the first casualty of cost-cutting). The
  inline answers + Visio + slimmed ERD are the best available.

---

## Sources

**Files** (`docs/ken/source/` unless noted): VRS_Introduction (≡
VRS_Training_Session_1), AP_Calc_Overview, ForecastEngineOverview,
VRS_AP_Side_Overview (`docs/ken/` — authoritative long copy), VRS_FDD_V4.1
(`docs/ken/`), Ken_answers_1–4 + Ken_followon_questions (`docs/ken/`),
VRS Delegates, VRS_Prototype_Build_Plan_2, VRS_Role_Lens_Vera,
VRS Summary for Executives, 3178 VRS Usability Enhancements 2017 PDD,
VRS_Analysis_and_Architecture, vrs-architecture-vera, DG_Roles_flat.csv.

**Emails** — 31 messages from kbanks@tpg-partners.com, 2026-04-08 →
2026-05-16 (Outlook; sender query). Key threads: "Quick sanity check on VRS"
(04-08); "VRS Prototype Request" (04-30); "Full Prototype data needs"
(05-01); "VRS Data" rounds 1–2 (05-01); "Follow Up" (05-04/05); "Data"
(05-05); "Outstanding Questions" rounds 1–3 (05-07/08/09/11); "VRS prototype
Functionality by Roles matrix" (05-11); "A little follow-up" (05-12); "1010
Analytic tool" (05-12); "The actual list of current questions" (05-16).
