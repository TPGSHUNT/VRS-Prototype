# Bubble-Field Index Model — business rationale + design

**Date:** 2026-05-17
**Status:** Design **agreed** (David, 2026-05-17). Not yet built. Sequenced
*after* the seat switcher (see §6). Supersedes/expands `docs/20` P1.5 (which
was a narrow axis-label fix) into a full index-model redesign.
**Companion:** `docs/06-design-language.md` (the surface), `docs/20` (the plan),
`docs/19` (the data asks this depends on), memory `project_bubble_index_model`.

---

## 0. The business perspective (how VRS is actually worked)

VRS is not a portfolio-browsing tool; it is a **work queue with money
attached**. Every seat's daily question is some form of *"what is off, by how
much, and does it matter enough for me to act?"* — not *"who is biggest?"*.
Bigness is already known (it's PEPSICO, Coca-Cola, P&G, every year). The work
lives in the **deviations**: what didn't finalize, what's collapsing YoY, what's
under its tier, what's waiting on my approval, where an agreement lapsed while
volume kept flowing.

By seat:

- **AP Analyst** — the bulk of daily usage. Period close: review → approve →
  finalize earnings, chase exceptions and adjustments/reversals, clear what's
  open before the period locks. Question: *"what in my book needs attention
  this period, worst first?"*
- **AP Manager** — oversight across analysts. Question: *"where is
  period-close risk concentrated, and on whom?"*
- **Buyer / Buyer Delegate** — agreement lifecycle. Question: *"which of my
  agreements are under-delivering vs forecast or sitting just under a tier?"*
- **DMM / GMM** — approval authority ($250K / $1M thresholds). Question:
  *"what value is waiting on my approval, and is it performing?"*
- **Read-Only / Finance / Exec** — the one seat where magnitude *is* the
  question: concentration, YoY movement, where the money moved. The
  "lasso the multi-billion-$ estate" showpiece lives here.

The legacy system answers none of these spatially — it's form-by-form lookup.
A bubble field whose **position encodes deviation** is the single most direct
expression of the demo thesis (the felt contrast: "the old way makes you go
find the problem; the new way the problem is already on screen, sized by how
much it costs you").

## 1. Why the original indices were suboptimal (independent of data gaps)

The original five — `contractValue`, `grossVolume`, `annualEarnings`,
`activeAgreements`, `activePrograms` — fail on first principles, before any
question of which extracts exist:

1. **Collinear.** All five are "how big is this vendor" proxies. A big vendor
   has big everything; plotting one against another produces a diagonal smear
   and wastes the two highest-bandwidth channels (X, Y) on one quantity.
2. **Levels, not deltas.** VRS work is deviation-driven; absolute magnitude
   doesn't tell an operator where to look.
3. **Attention-blind.** Position encodes static size; the only state signal is
   one GREEN/AMBER/RED attribute — the surface can't *show the work*.
4. **Seat-blind.** One global default for a CFO, a buyer, and an AP analyst,
   whose jobs share almost no question.
5. **Counts make poor axes.** `activePrograms`/`activeAgreements` are
   tie-heavy small integers — lumpy position, good filters not good axes.

## 2. Design principles

- **Triage-first.** Position = *how off and by how much*. Not magnitude.
- **Size = materiality ($).** A consistent "bubble size = dollars at stake"
  reading across every seat, so the eye learns it once.
- **Seat-driven defaults.** X/Y re-shape per seat to that seat's actual job.
- **Axis independence.** The default X/Y pair must measure different things
  (staleness vs wrongness; delivery vs movement) — never bigness vs bigness.
- **Counts/categoricals → filters**, not axes.
- **Honesty over fabrication.** A metric needing an extract we don't have
  ships disabled and labeled "awaiting extract", never faked
  (memory `project_no_synthetic_data`).

## 3. Index vocabulary (replaces the five)

| Metric | Answers | Role | Feasible now? |
|---|---|---|---|
| **earningsFY** ($) | this-year materiality | size (universal) | ✅ now |
| **earningsLTD** ($) | lifetime materiality | size (alt) | ✅ now |
| **reviewAging** (periods behind) | how stale is my work here | position · attention | ✅ now |
| **openExposure** ($ not FINALIZED, live/last period) | how much $ still open | position · attention | ✅ now |
| **exceptionLoad** ($/# adjusted, reversed, anomalous) | how much is *wrong* | position · attention | ✅ now |
| **yoyEarningsDelta** (%) | who's collapsing/surging | position · performance | ✅ now |
| **paceToTarget** (%) | YTD actual vs run-rate | position · performance | ✅ now |
| **earningsVsExpected** (%) | delivering vs forecast | position · performance | ⚠️ needs D1 |
| **tierAttainmentGap** | distance to the missed tier | position · performance | ▲ proxy now, exact w/ K8 |
| **approvalQueueValue** ($ awaiting *this seat*) | how much is on me | position · attention | ▲ partial, full w/ D1 |
| **uncapturedOpportunity** ($) | money on the table | position · opportunity (Vera) | ▲ proxy now, sharp w/ D1/K8 |

Demoted to **filter facets**: `activePrograms`, `activeAgreements`,
merch type, source, analyst, buyer.

`reviewAging` unit = **periods behind** (domain-native integer, demo-legible),
not raw days (David, 2026-05-17). Validate the period math against the
`year=0/period=0` sentinel confirm (`docs/19` D4).

## 4. Per-seat default triplet (X · Y · size)

| Seat | X | Y | size | Outlier that pops |
|---|---|---|---|---|
| AP Analyst | reviewAging | exceptionLoad | earningsFY | old + wrong + big → triage first |
| AP Manager | openExposure | reviewAging | earningsFY | where close-risk concentrates |
| Buyer / Delegate | earningsVsExpected | tierAttainmentGap | earningsFY | big agreements under-delivering near a missed tier |
| DMM / GMM | approvalQueueValue | earningsVsExpected | earningsFY | large value on me, and is it performing |
| Read-Only / Finance / Exec | earningsFY | yoyEarningsDelta | earningsLTD | the magnitude scan + who's moving |
| Vera lens (cross-seat preset) | uncapturedOpportunity | yoyEarningsDelta | earningsFY | "leaving $X with vendor Y whose earnings are collapsing" |

Operator seats hold size = `earningsFY` deliberately (consistent materiality
read). The Finance seat is the only place the original magnitude lens
survives — kept because magnitude *is* the right question there — but Y now
adds the movement dimension legacy never had, so the showpiece is a moving
estate, not a static smear.

## 5. Retained presets (dropdown, not default)

Nothing is lost; the demo can pivot live:
- **Portfolio magnitude** — the original `earnings × programs, size volume`
  lens, kept as the explicit "here's the old way of seeing it" contrast button.
- **Triage** (aging × exception) · **Performance** (vs-expected × YoY) ·
  **Opportunity (Vera)** — the families as one-click presets.

## 6. Sequencing (decided 2026-05-17)

**Seat switcher first.** Per-seat defaults (§4) have no delivery vehicle until
the seat switcher exists, so it is re-sequenced *ahead* of this redesign
(`docs/20`: P2.3 moves before the P1.5-successor work). Build order:

1. **Seat switcher** (`docs/20` P2.3) — prerequisite.
2. **Feasible-now metrics** (§3 ✅ rows) + presets + the Finance/magnitude
   default — can be built in parallel with the switcher (no switcher/Ken
   dependency); only the *per-seat default wiring* waits for the switcher.
3. **Per-seat defaults** (§4) — lands on top of the switcher.
4. **D1/K8/D2-dependent metrics** — enabled as those extracts arrive
   (`docs/19`); shipped disabled+labeled until then.

The narrow original P1.5 item (fix the false `($, log)` subtitle — the scale
is rank-percentile, not log) is independent and can be done anytime.

## 7. Data dependencies (see `docs/19`)

| docs/19 ID | Unblocks |
|---|---|
| **D1** Full MDSE Agreement extract | `earningsVsExpected`, `approvalQueueValue`, real `contractValue`, buyer/DMM/GMM scoping |
| **D2** Volume tables | `grossVolume`, `paceToTarget` coverage, purest `uncapturedOpportunity`, 1010-Intelligence |
| **K8** REBATE_TIER/REBATE_TIERS | exact `tierAttainmentGap`, sharper `uncapturedOpportunity` |
| **D3** Invoice/billing | billing-aging attention (secondary) |
| **K6** uncaptured exemplar (conversation) | tunes the Vera narrative |
| **D4** year=0/period=0 confirm | validates `reviewAging` period math |

D1 + D2 + K8 are the three that convert Performance/Opportunity from
proxy/stub to real. Requested via the round-5 data ask
(`docs/ken/Ken_data_request_round5.txt`; David routes — engineering does not
contact Ken directly).
