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

1. `MEMORY.md` (auto-loaded) + the `project_*`/`feedback_*` memories — these
   carry the durable decisions and working norms. **Read before acting.**
2. This file.
3. `docs/21-bubble-index-model.md` — the bubble-field design + business
   rationale (triage-first, seat-driven, deterministic layout). Current.
4. `docs/20-gap-closure-plan.md` — the living phased plan + build status.
5. `docs/19-ken-asks.md` — the running data-ask accumulator (what's still
   needed from Ken; round-5 sent).
6. `docs/16-legacy-subsystems.md` + `docs/17-legacy-forms-image-catalog.md` —
   background: the real 603-table scope vs the prototype; legacy Forms.
7. `docs/ken/*` — Ken's verbatim answers + source data (the irreplaceable
   source of truth). `docs/06-design-language.md` — binding UI rules.
8. `git log --oneline -15`.

## 3. Current state (2026-05-17)

**Data.** Live local Postgres holds the **real Phase 3.1 ingest** (851,174
CalculateResult · 2,573 vendors · multi-year FY2024–26) + the real ROUND_4
AcctControlMaster (2,842 rows). **No synthetic data anywhere** — the
synthetic seed is deleted by policy (memory `project_no_synthetic_data`);
populate only via `prisma/ingest/real_ingest.py` + `npm run db:load-acm`.
`npx prisma migrate reset` would wipe it irrecoverably except by re-running
that pipeline (memory `project_db_holds_real_ingest_seed_is_destructive`).

**Built (this work cycle).**
- **Seat switcher** — in-header, persistent; `/login` is now a no-grid SSO
  shim that auto-establishes a default AP-Manager estate seat. Live
  seat-hopping re-scopes the field.
- **Bubble-field substrate** — metric vocabulary swapped to the
  triage-first feasible-now set; **deterministic layout, no force
  simulation, no collision** (overlap is truthful; a future user-drawn
  exploder is the only de-overlap); real non-collinear defaults
  (X=active programs, Y=earnings FY, size=earnings LTD); attention-driven
  health; forecast/volume metrics shown disabled+labeled (never faked).
- **Pan & zoom** on the field (drag empty space, wheel-to-cursor, +/−/reset).

**Verified.** `tsc` 0 errors; `next build` clean (modified Next 16.2.4);
headless auth'd render of `/` as the estate seat over all 2,573 vendors,
no server errors. Visual feel still wants a manual browser pass.

## 4. Open / next

- **Attention-detector model** (proposed, awaiting go) — make the field
  surface real problem vendors *without* new data, via computable detectors
  (YoY collapse, earnings cliff, lapsed-program-with-activity). The
  all-green today is correct (closed periods 100% finalized), not a gap.
  Detail + rationale: this is the next step in `docs/21` §8.
- **Manager analyst-clustered aggregation + triage-encoding**; the
  **user-drawn exploder**; **per-seat default wiring** — `docs/21` §8.
- **Ken round-5 data ask sent** (`docs/ken/Ken_data_request_round5.txt`):
  D1 agreements, D2 volume, K8 tiers sharpen Performance/Opportunity
  metrics — non-blocking; tracked in `docs/19`.
- Decisions still open: demo centerpiece, real-data governance home, build
  ownership/timeline (`docs/20`).

## 5. Working norms

Carried in memory (`feedback_explicit_consent`,
`feedback_data_reflects_actual_conditions`, etc.) — the binding source.
In short: ask before code/commits; observations are signals to discuss, not
directives; real data only, never synthetic; calibrated, terse, no emojis;
trust Ken on legacy behavior, not on rewrite architecture; engineering does
not contact Ken directly (David routes).
