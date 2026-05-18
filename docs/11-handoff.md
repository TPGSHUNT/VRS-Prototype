# VRS Prototype — Orientation & Current State

**Updated:** 2026-05-17. This is the entry point for a fresh thread. It is
kept lean and current; history lives in git, durable context in the Claude
memory dir (`MEMORY.md` + `project_*`/`feedback_*`). Older handoffs and the
point-in-time analysis/schema/question docs were removed 2026-05-17 as
superseded — git history retains them.

---

## 1. What this is

Rebuilding Dollar General's 30-year Oracle Forms VRS (Vendor Rebate System)
as a **demo prototype**. Ken Banks (TPG, original VRS author, retiring
Jan 2027) is the domain authority. The demo thesis is a **completely new,
frictionless way to see and work the vendor-rebate estate** — explicitly NOT
Oracle-Forms conversion (that framing is dead; see memory
`project_demo_thesis`). **Ask Vera** (Vendor Earnings & Rebate Advisor) is a
co-central goal.

## 2. Read order for a fresh thread

1. `MEMORY.md` (auto-loaded) + the `project_*`/`feedback_*` memories — durable
   decisions and working norms. **Read before acting.**
2. This file.
3. **`docs/22-ken-commentary-emails-and-files.md`** — the consolidated,
   source-attributed digest of Ken's emails + files. **The domain ground
   truth; it now reshapes the design (see §3 direction change).**
4. `docs/21-bubble-index-model.md` — bubble-field design + rationale
   (triage-first, deterministic; §9 = the built encoding spec).
5. `docs/20-gap-closure-plan.md` — living phased plan + build status.
6. `docs/19-ken-asks.md` — data-ask accumulator (round-5; partly answered by
   the corpus — see §4).
7. `docs/16` + `docs/17` — background (603-table scope; legacy Forms).
8. `docs/ken/*` (verbatim answers, `source/` = extracted files) +
   `docs/06-design-language.md` (binding UI rules).
9. `git log --oneline -15`.

## 3. Current state (2026-05-17)

**Data.** Live local Postgres = **real Phase 3.1 ingest** (851,174
CalculateResult · 2,573 vendors · FY2024–26) + real ROUND_4 AcctControlMaster
(2,842). **No synthetic data anywhere** — synthetic seed deleted by policy;
populate only via `prisma/ingest/real_ingest.py` + `npm run db:load-acm`;
`prisma migrate reset` wipes it irrecoverably (memories
`project_no_synthetic_data`, `project_db_holds_real_ingest_seed_is_destructive`).

**Built & committed (pushed through `5b3b6ed`):**
- **Seat switcher** — in-header; `/login` is a no-grid SSO shim → default
  AP-Manager seat; live seat-hopping re-scopes.
- **Bubble field, `docs/21` §9 in full** — semantic axes (no X/Y/Size
  pickers): Materiality (composite, equal-thirds, configurable,
  rank-normalized, transparent) = vertical+size; Performance (same-period
  YoY, not the partial-year trap) = horizontal; Attention (cliff/collapse/
  operational, ~10% flagged truthfully) = colour. Top **settings bar**.
  **Deterministic, no force-sim, no collision; pan & zoom.**
- **Estate aggregation** — estate never raw atoms: opens as clusters,
  drill → atoms, atom **CEILING 200**, breadcrumb.
- Verified each step: `tsc` 0, `next build` clean (modified Next 16.2.4),
  headless auth'd render OK. SSR ≈ **3.6 s** (modal-owner CTEs; perf
  follow-up). Visual feel still wants a manual browser pass.

> ### ⚠ Direction change — read before touching the bubble field
> The estate aggregation as built clusters **by analyst**, derived from
> created/updated-by. The Ken corpus (`docs/22` §7) **authoritatively**
> establishes that is wrong: **AP has NO analyst→program/vendor
> assignment**; created/updated-by are research-only audit fields that often
> hold a *process* name (that is exactly why clusters showed "Batch Exec",
> "Upload"). AP "ownership" is only a soft **Merch-Type**-derived label
> (`GET_ANALYST` initials). Only the **MDSE Buyer** has a real assigned book
> (Agreement↔Buyer FK + Delegate proxy).
>
> **Decided model (not yet built):** drop "analyst" as a cluster dimension;
> **Merch Type is the estate organizer**; analyst → optional derived filter.
> Three role archetypes drive the per-seat default: **operator triage**
> (AP Analyst, MDSE Buyer/Delegate), **oversight estate by Merch Type**
> (AP Mgr/Supervisor, Finance/Exec), **decision queue** (DMM/GMM/SVP). Full
> per-role layout: `docs/VRS_Role_Driving_Estate.docx` (internal) and
> `docs/22` §7. This **supersedes** the just-built analyst clustering.

## 4. Open / next

- **Re-base the estate aggregation on Merch Type** (drop the analyst
  dimension) and implement the **three-archetype per-seat defaults** above.
  This is the top engineering item; the just-built analyst clustering is on a
  wrong basis.
- **SSR perf** (~3.6 s; the analyst/program-type modal CTEs) — dropping the
  analyst-modal aggregation should itself help; optimize when re-basing.
- **User-drawn exploder** (atom-level de-overlap) — still pending.
- **AP-analyst daily run-of-show** — the one load-bearing unknown not in any
  doc/email. A validation doc is prepared: `docs/VRS_Roles_for_Ken_
  Validation.docx` — **awaiting David to route to Ken** (engineering does
  not contact Ken).
- **Ken round-5 ask** (`docs/ken/Ken_data_request_round5.txt`) — partly
  answered by the corpus (analyst-assignment now resolved); **K8 tiers / D1
  agreements / D2 volume still pending** (`docs/19`).
- Decisions still open: demo centerpiece, real-data governance home, build
  ownership/timeline (`docs/20`).
- Minor: **"estate" is our coinage**, not a Ken/DG term — possible
  terminology cleanup (→ "the whole book" / "full portfolio"); not blocking.

> **Uncommitted as of 2026-05-17** (next thread: commit with David's go, or
> know they're not in git): `docs/22-ken-commentary-emails-and-files.md`,
> `docs/ken/source/*` (13 extracted files), `docs/VRS_Role_Driving_Estate.docx`,
> `docs/VRS_Roles_for_Ken_Validation.docx`, and several memory updates
> (`project_bubble_index_model` carries the cluster-dimension resolution).

## 5. Working norms

Carried in memory (`feedback_explicit_consent`,
`feedback_data_reflects_actual_conditions`, etc.) — the binding source.
In short: ask before code/commits; observations are signals to discuss, not
directives; real data only, never synthetic; calibrated, terse, no emojis;
trust Ken on legacy behavior, not on rewrite architecture; engineering does
not contact Ken directly (David routes).
