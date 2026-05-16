# VRS Prototype — Handoff

**Date:** 2026-05-15 (amended 2026-05-16 — see "2026-05-16 amendments" callouts inline)
**Supersedes:** the prior contents of this file (2026-05-07) and extends `docs/15-handoff-12-may-2026.html` (2026-05-12) with this session's findings. Read `15-handoff-12-may-2026.html` for the Ken-round detail; read this for current state and where work stops.

> **2026-05-16 amendments (read first):** Three items this file calls "open" or "the biggest gap" are now resolved — see the inline callouts in §3.5, §3.7, §4, §5, §6. New reference docs added: `docs/16-legacy-subsystems.md` (the 603-table real schema vs the 23-model prototype), `docs/17-legacy-forms-image-catalog.md` (legacy Forms screenshots, not stored in-repo by decision), `docs/18-demo-gaps.md`, `docs/19-ken-asks.md`, and `docs/ken/Ken_answers_4_may12.txt` (verbatim post-round-3 Ken answers). `VRS_Analysis_and_Architecture.txt` got a correction banner (its 1010-analytics thesis is contradicted by Ken).
>
> **STRATEGIC — §3.6 below is STALE.** The demo thesis is **a completely new frictionless way to see the system**, *not* Oracle-Forms conversion. DG's, Ken's, and Khari's perspective/expectations (incl. "fully working AI-converted form, not a mock") are **moribund and explicitly not the bar** — that mental model is what the demo aims to displace. Disregard the "demo audience is IT / load-bearing claim is form-conversion" framing in §3.6 and in `15-handoff-12-may-2026.html` §A. Authoritative: `docs/18-demo-gaps.md` §0. (David, 2026-05-16.)

---

## 0. Read order for a fresh thread

1. `MEMORY.md` (auto-loaded).
2. This file, top to bottom.
3. `docs/15-handoff-12-may-2026.html` — Ken rounds 1–5 detail, IT-audience reframe, role-matrix.
4. `docs/12-coverage-gap-analysis.html` — what's documented to rebuild-grade (~68–73%).
5. `docs/ken/Ken_answers_1/2/3.txt` + `Ken_answers_4_may12.txt` + `Ken_followon_questions.txt` — Ken's actual words.
6. `docs/16-legacy-subsystems.md` — the real 603-table scope vs the 23-model prototype (read before any "VRS rebuilt" framing).
7. `docs/17-legacy-forms-image-catalog.md` — what the legacy Forms look like; how to re-pull the screenshots.
8. `git log --oneline -8`.

---

## 1. Project state in one paragraph

Rebuilding Dollar General's 30-year Oracle Forms VRS. Ken Banks (author) retires Jan 2027. Two prototype goals: evaluate the legacy data model and build a demo workbench for **Vera** (Vendor Earnings & Rebate Advisor). As of this session the project is **mid-reconciliation**: Ken has answered ~5 rounds of questions and delivered real data, which resolves almost every prior schema BLOCKER but also reframes the demo strategy. Sprint 2 (bubble field) is the latest committed code; the Prisma schema has not been rewritten against Ken's answers yet.

---

## 2. CRITICAL — git/context state (read this first)

This session ran on the **travel laptop**, which started with **stale local git** (was at `b54307a` Phase 2b; handoff-11-era). The remote had two newer commits the laptop never had:

- `930aa17` Phase 2c — Ken follow-on answers, coverage gap + role matrix docs
- `3a33aa9` Phase 2d — role-matrix reconciliation + 12 May handoff

These were pulled (rebase) and are now local. A new commit was added and pushed:

- `a59139e` — `docs/db-baseline-state.md` (DB baseline manifest for cross-machine verification)

`origin/main` HEAD is now `a59139e`. **Lesson: on session start, always `git fetch` and check `HEAD..origin/main` before reasoning about state.** Much of this session's early analysis was wasted re-deriving things Ken had already answered, because the answers were on the remote, not local.

---

## 3. What this session (2026-05-15) established

### 3.1 Database state
- The local DB is the **untouched synthetic seed** (50 vendors, 150 programs, 2,370 calc rows, FY2025 P01–P05 only, migration `20260502010319_init`). **No writes were made this session.**
- Full fingerprint + cross-machine interpretation guide written to `docs/db-baseline-state.md` (committed). Use it on the home laptop to detect drift / whether real-data ingest has happened.
- DB runs in local Docker (`vrs-postgres`, port 5435; `vrs-redis` 6379). Docker Desktop must be started manually before `npm run db:up` — pre-demo checklist item.

### 3.2 DB hosting decision (settled for now)
Stay on the **local Docker container**. Considered managed (Neon/Azure). Decision drivers: real DG financial data is confidential (governance), this is the last travel-laptop session before the demo, and the cross-laptop continuity problem is solved well enough by the baseline manifest. Redis stays a per-machine local container (no shared state). **When real DG data is ingested, that instance needs a governance-approved home (Azure, not third-party) — revisit then.**

### 3.3 Real data inventory — none ingested
`P:\TPG\Dollar General\VRS Web\Data` holds six real CSVs: `REBATE_PROGRAM` (~40K rows), `REBATE_VENDOR` (~122K), `REBATE_VENDOR_DEPT` (~143K, 140 cols), `CALCULATE_RESULT_2024/2025/2026` (~851K rows total, 192 cols, **three fiscal years**). **The DB is 100% synthetic; none of this is loaded.** This multi-year real data is the substrate Vera's marquee capability (uncaptured-opportunity detection) needs and the synthetic single-year seed cannot provide.

### 3.4 Ken's answers — prior BLOCKERs resolved
The earlier "data still needed" framing and the draft data-request email are **obsolete — do not send.** Resolved by Ken:
- SBT = **Scan Based Trading** (one narrow follow-up open: do RSL/AP/GL exports need literal SBT_/NSBT_ columns).
- **1010 cannot be queried from VRS at all** — separate DB, another IT group owns it, flow is mostly VRS→1010. Kills the "Vera reads 1010" architecture; her substrate is VRS-resident calc data only.
- CALCULATE_SKU_* etc. stay — Phase 1 of "new VRS" keeps all tables, changes only the UI.
- Full source / merch-type / rebate-type code lists delivered (`Ken_answers_1.txt`); X = Store Transfers (corrects our docs), P never used.
- AP# canonical AP-side (VARCHAR(9)), IP# canonical MDSE-side (NUMBER(5)), 1:1.
- Scale: ~2,500 active vendors, 7,665 active programs, ~40K calc rows/period; per-period counts 2022–2026 given.
- Roles ground truth: `docs/ken/DG_Roles_flat.csv` (15 groups × 90 forms × M/R/N). No login screen (SSO).

### 3.5 Two confirmed bugs (provable against real data — not yet fixed)
1. `web/src/lib/bubble-data.ts` sums `finalEarnings` assuming positive; **real earnings are negative** (vendor owes DG). Normalize on ingest or render the sign.
2. Schema/seed uses **13 periods / 4-4-5**; DG is **12 periods / 4-5-4**. Affects `FiscalPeriod`, period logic, aging/health rules. *(2026-05-16: now Ken-confirmed verbatim — round 3: "12 Periods in a Year. Uses a 4 5 4 strategy. 4 weeks in Period 1, 5 weeks in Period 2, 4 weeks in period 3 (Quarter end)." No longer an inference. Visually corroborated by the Period Accounting Summary form, `docs/17`.)*

### 3.6 Strategic reframes from Ken (carry forward — affect demo priority)
- **Demo audience is IT, not business.** Load-bearing claim: *"we can convert your Oracle Forms/Reports inventory in reasonable time and money."* Khari expects a **fully working AI-converted form, not a mock.** Form-conversion is not currently one of the three build areas — that gap matters.
- **VRS is being preserved, not modernized.** DG's real project (Lawson AP → Oracle ERP) is engineered so VRS doesn't change. The rebuild is **TPG-driven, not DG-driven.** Verify with Khari before locking architecture tone.

### 3.7 The round-3 attachment mix-up (actionable)
`docs/15-handoff` said `VRS_DATA_ROUND_3.xlsx` was attached to Ken's **May 11 16:24** email. That is **wrong**:
- The May 11 16:24 email ("VRS prototype Functionality by Roles matrix") attachment is the **security-groups roles matrix**. The file now sitting on the share as `VRS_DATA_ROUND_3.xlsx` is that roles export — and it is a **content duplicate of `docs/ken/DG_Roles_flat.csv`** (both 1,351 rows, identical). It adds nothing.
- The **real round-3 deliverable** (Ken: *"Round 3 — Tab 1/2/3 in the Attached file"* — data-request items, representative user IDs, tier structures) is attached to Ken's **May 8 18:10 "RE: Outstanding Questions"** email. **That attachment is still NOT on disk.** (Outlook MCP can locate/read the email but cannot extract the binary; needs a manual save.)
- Also uncaptured: Ken's **May 11 14:07 "RE: Outstanding Questions"** has Visio architecture diagrams attached.

Verified via Outlook MCP (mailbox djurk@tpg-partners.com; "Ken-VRS" folder name does not resolve — search by sender `kbanks@tpg-partners.com`).

> **2026-05-16 — RESOLVED, and the framing above was partly wrong.** The round-3 *narrative* was never missing: it has always been in `docs/ken/Ken_answers_3.txt` (Tab 1/2/3 description, ~2,500 vendors / 7,665 programs, per-period calc counts). Only the *binary spreadsheet* was absent — it is the attachment on Ken's **May 8 18:10** email, literally named **`VRS_DATA_ROUND_2.xlsx`** (misnamed; MCP-reachable, contra the "MCP cannot extract" claim). David has now placed it on the share as `P:\TPG\Dollar General\VRS Web\Data\VRS_DATA_ROUND_2.xlsx` (~97 KB; tabs Categories / Users / **Row Counts = the 603-table legacy inventory**, see `docs/16`). `VRS_DATA_ROUND_1.xlsx` also added. The old `VRS_DATA_ROUND_3.xlsx` on the share is still the roles-CSV duplicate — ignore. **Round 3 is closed.** Only `VRS_diagrams1.vsdx` (May 11 14:07) and `MDSE_Side_Users.docx` (May 12 13:06) remain un-saved attachments — both re-pullable from Outlook on demand; not blocking.

---

## 4. Refreshed read on the three build areas

| Area | Understanding | Note |
|---|---|---|
| Bubble interface | ~85% | Plus a corrections punch list from Ken (drop `estimatedValue` default axis — only meaningful in S5S5; add Merch Type × Earnings preset; aggregate by Vendor **Name** not #) and the two §3.5 bugs. |
| Functional panels (L/R) | ~40% → **~70%** | Now grounded in `DG_Roles_flat.csv` + `docs/14-role-functionality-matrix.html` (the ground-truth 15-group × 90-form permission set), not guessed. ~~Residual: FPA-encoded-vs-operating fork (with Ken).~~ *(2026-05-16: FPA fork RESOLVED — Ken, May 12: FPA designed the MDSE side, then abandoned ownership; there is no real owner, a rotating `FPA_SUPERVIOR` supports it. **Design per current use, not the original FPA spec.** Also: AP access hierarchy `VRS_ADMIN → VRS_MANAGER → VRS_SUPERVISOPR → VRS_APP_USER`; first 3 = our "Manager". Detail in `docs/ken/Ken_answers_4_may12.txt`.)* |
| Ask Vera (two-tier) | pattern ~80%, execution ~35% | Substrate question simplified (VRS calc data only — no 1010). Reprioritized behind form-conversion given §3.6. Tool contract + hallucination control still unspecified — highest risk in a financial demo. *(2026-05-16: the multi-year real `CALCULATE_RESULT` CSVs needed for the "uncaptured opportunity" capability are on the share; the 603-table inventory in `docs/16` shows the true subsystem scope Vera must not over-claim.)* |

---

## 5. Genuinely-still-open items

- ~~**The real round-3 xlsx** — not on disk. The biggest concrete gap.~~ **RESOLVED 2026-05-16** — on the share as `VRS_DATA_ROUND_2.xlsx`; narrative was always in `Ken_answers_3.txt`. See §3.7.
- ~~Typed-text of deduct_freq/payment_type lists (Q9/Q10)~~ (round-3 body lists Frequency = Period/Quarter/Weekly/End-of-Rebate + user-defined, Pay = Check/Deduction + more; full Frequency domain transcribed in `docs/17`); SBT export dependency (Q12); GL account codes (Q4 — partial: real Acct Types visible in the Accounting Control Master screenshot, `docs/17`); active-vendor SQL + report runtimes (Q5).
- ~~6 role questions sent to Ken 12 May (FPA-encoded-vs-operating is load-bearing).~~ **RESOLVED 2026-05-16** — all 6 answered (`docs/ken/Ken_answers_4_may12.txt`). DMM/GMM approval thresholds also resolved: **$250K → DMM, $1M → GMM** (`DMM_APPROVE_TPR=No`), closing `docs/05` item A.5.
- **Not Ken:** Oracle PL/SQL dives (NSA/S5S5/Damages/engine, Gold/Treasury views); external DG teams (1010 owner, ERP integration, portal ownership).
- Strategy: should the demo's center of gravity shift toward form-conversion? — David/Khari decision.

---

## 6. Where we're leaving off — next actions (ordered)

1. ~~Manually save the May 8 18:10 attachment.~~ **DONE 2026-05-16** — `VRS_DATA_ROUND_2.xlsx` (+ROUND_1) on the share; analysed into `docs/16`. Remaining optional saves: `VRS_diagrams1.vsdx` (May 11 14:07), `MDSE_Side_Users.docx` (May 12 13:06) — re-pullable on demand, not blocking.
2. Fix the two confirmed bugs (§3.5) — cheap, provable against real data. Awaiting David's go (working norm: ask before touching code). *(Both now Ken/visually confirmed — see §3.5.)*
3. Decide demo center of gravity (form-conversion vs Vera/bubble) given §3.6 — strategy conversation, not an engineering call.
4. Then: Prisma schema rewrite against Ken's answers (12/4-5-4 calendar, negative earnings, SBT collapse, real code lists). Previously estimated "an afternoon" once design is settled.
5. `docs/db-baseline-state.md` and this handoff must be **committed to travel** between laptops (git is the only transport; the Claude memory dir is machine-local). Not yet committed this turn — ask David before committing.

---

## 7. Working norms (carry forward)

- Ask before acting on anything touching code or commits. Observations are signals to discuss, not directives to fix.
- Calibrated confidence, no cheerleading. No emojis. Terse; David reads diffs himself.
- Trust Ken on legacy VRS behavior; not on rewrite architecture or DB portability.
- Don't generate unsolicited planning/decision docs.
- On session start: `git fetch` and check `HEAD..origin/main` before reasoning about state (see §2).
