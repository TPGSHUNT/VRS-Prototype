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

---

## 8. Refinements + build status (2026-05-17)

Settled in discussion with David and **partially built**:

### 8.1 No collision, no force simulation (built)
Collision-avoidance was never wanted — **bubbles may overlap; co-located
bubbles mean co-located data, which is truthful.** The only reason the old
`BubbleField` ran a D3 force simulation was to resolve collisions; with that
removed, **layout is a pure deterministic computed pass** (rank-percentile on
X/Y, median-centered; sqrt-area size). It renders instantly at any N and
never "dances." A future **user-drawn exploder** is the only thing that ever
separates an overlapping cluster, on demand and locally. (This deleted the
entire sim/`forceCollide`/tick path — the real cause of the "mass that never
loads" at 2,573 vendors.)

### 8.2 Triage-*encoding* vs triage-*filtering* (the layer distinction)
"Triage-first" is the organizing principle at every layer, but it expresses
differently by seat — these are not competing defaults:
- **Operator (individual agent)** — triage-*filter*: show only their slice's
  vendors with a live attention signal, long tail collapsed. **Operators get
  NO holistic/aggregate views** (decided 2026-05-17) — only their filtered
  atoms + their own "show all" soft-lens.
- **Manager / estate** — triage-*encode*: show the whole structure
  **aggregated**, nothing filtered out (absence of work is itself oversight
  signal), but size/colour encode *attention load*, not bigness. Default
  cluster dimension = **by analyst** ("your team's load at a glance"), easily
  **configurable** to other dimensions. Click a hot cluster → drill to the
  triage-filtered atoms within it.

### 8.3 Built now vs still pending

**Built (this session, pending commit):**
- Metric vocabulary swapped to the feasible-now set (`§3 ✅`); old collinear
  five removed. Forecast/volume metrics shown **disabled + labeled
  "awaiting D1/D2/K8"** in the selector — never faked.
- Health is **attention-driven** (RED = behind on a closed period; AMBER =
  post-final adjustment; else GREEN), not historical-finalized state. On real
  data this is truthfully ~all-GREEN — differentiation now comes from size +
  position, not colour.
- `BubbleField` rewritten: deterministic static layout, overlap allowed, no
  sim. False "log scale" subtitle removed (it was rank-percentile).
- New defaults: **X = active programs, Y = earnings (this FY),
  size = earnings (lifetime)**, colour = attention. Real, non-collinear,
  instantly populated (verified against the 2,573-vendor real DB).
- **Pan & zoom** on the field (drag empty space, wheel-to-cursor, +/−/reset;
  plot content transforms, axis/legend fixed).

**Not yet built (next, in order):**
1. **Attention-detector model** (proposed, awaiting go) — the field is
   truthfully all-GREEN today because real closed periods are 100% finalized;
   that is correct, *not* a data gap. Surface real problem vendors **with no
   Ken dependency** via computable detectors on the multi-year data already
   ingested: **YoY earnings collapse**, **earnings cliff** (material last FY,
   ~$0 this FY), **lapsed/closed program with continued activity**. Composite
   severity → bubble colour (RED/AMBER) + a selectable metric; later feeds the
   operator triage-*filter* and Manager triage-*encode* (§8.2). Tier-precise
   under-attainment needs K8 and purest no-program-volume needs D2 — those
   *sharpen/add*, they do not gate. Every flag traces to real rows
   (`project_no_synthetic_data`).
2. **Analyst-clustered aggregation + triage-encoding** for the Manager/estate
   seat (rides on the seat switcher, which exists). Cluster dimension
   configurable.
3. **User-drawn exploder** (local de-overlap on demand). Detachable.
4. **Per-seat default wiring** (the `§4` triplets) once aggregation lands.
5. D1/D2/K8-dependent metrics enabled as those extracts arrive.

> **Note:** §9 below supersedes the generic X/Y/Size metric-picker model in
> §1–§5 for the *encoding*. §1–§5 remain valid for the metric *vocabulary*
> and feasibility; §9 defines how those quantities are actually mapped to the
> field (semantic axes, composite materiality, attention, settings). Where
> they differ, **§9 is the spec of record.**

---

## 9. The "now"-anchored encoding: Materiality / Performance / Attention + settings

Settled with David 2026-05-17 (this conversation). This is the **complete
design of record** for how the field encodes data. Not yet built.

### 9.1 Temporal frame — what "now" means

The real ingest contains: **FY2024 & FY2025 complete** (12 periods each),
**FY2026 = periods 1–2 only**, and **year 0 = the "current/open period"
sentinel** (the period being worked now; this is exactly the **D4**
Ken-confirm still outstanding — treated here as the live in-progress period,
flagged as an assumption, §9.8).

**The partial-year trap (must not be repeated).** A naive
"current-FY vs prior-FY" comparison compares partial FY2026 (2 periods) to
full FY2025 (12) and falsely flags ~53% of vendors as collapsed. Equally,
triaging in mid-FY2026 off a **stale FY2025-vs-FY2024** comparison is
backward-looking and not operationally meaningful.

**Rule:** every year-over-year computation is **same-period** — FY2026-YTD
vs FY2025 *same elapsed periods* — never full-vs-partial, never the stale
last-two-complete-years. "Now" = mid-FY2026; the freshest signals are
FY2026 P1–2 plus the open (year-0) period.

### 9.2 Three semantic dimensions — no X/Y/Size pickers

The generic "pick any metric for X / Y / size" model is the build-your-own
BI-chart pattern the demo exists to displace: it permits meaningless scatter
and offloads the analysis onto the viewer. Instead the axes carry **fixed
semantics**; only their *definitions* are configurable.

| Channel | Semantic | Configurable? |
|---|---|---|
| Vertical position **and** bubble size | **Materiality** — "how much this vendor matters" (reinforced: same source drives both) | Yes — the composite definition (§9.3) |
| Horizontal position | **Performance** — "how it's doing" (continuous: contraction ← → growth) | Yes — the performance definition (§9.4) |
| Colour | **Attention** — "does it need me now" (thresholded) | The attention model (§9.5) |

Only **two configurable definitions** (Materiality, Performance). There are
**no axis-assignment controls**. The field cannot be configured into
nonsense and tells the triage story by default.

**Size = Materiality, reinforced with vertical position (decided, v1).**
Redundant encoding of the single most important quantity is deliberate
emphasis (big-and-high = important, read instantly), not waste. Freeing the
size channel for a distinct quantity (e.g. "$ in flight in the open period")
is noted as a **future lever**, not v1.

### 9.3 Materiality — the composite

Three data-agnostic categories (listed in full regardless of current
computability — Ken's data gaps do not shape the model):

- **Cat 1 — Earnings** (rebate-$ outcome): trailing-12-month earnings ·
  latest full-FY earnings · lifetime (LTD) · open/live-period earnings.
- **Cat 2 — Commercial size** (the underlying business, the input):
  gross commercial / purchase volume · volume-to-date (current FY) ·
  contract / expected (forecast) rebate value.
- **Cat 3 — Breadth** (structural footprint; count, not $):
  active programs · active agreements · department / category coverage.

**Composite** = weighted blend of the categories, each component
**rank-percentile-normalized** before weighting (the same unit-free method
the field uses for position — combines $ and counts sanely, robust to
outliers and to missing data). **Default weights = equal thirds
(⅓ / ⅓ / ⅓), user-configurable.**

**Missing-data rule (not synthetic):** a category with no data today (Cat 2
needs D1/D2; parts of Cat 3 need D1) simply **does not contribute**; its
weight **renormalizes across available categories** so the composite is
always meaningful and **upgrades automatically** when an extract lands — no
placeholder values, ever (`project_no_synthetic_data`).

**Transparency (mandatory — financial demo / Vera ethos):** hover/inspect
shows the component attribution ("large because: earnings 78th pctile,
breadth 95th; volume — pending"). A naked blended number is not acceptable.

**Single-variable override:** within the Materiality setting the user may
collapse the composite to one variable. This is a *Materiality definition*,
**not** a free axis.

**Rendering:** the composite drives vertical position (rank-percentile,
median-centered, per §8.1) **and** bubble area (sqrt of the composite) from
one source — two channels, deliberate reinforcement.

### 9.4 Performance — the horizontal spectrum

Continuous, signed: contraction ← centre → growth. **Default definition:
same-period YoY trajectory** (FY-YTD vs prior-FY same elapsed periods, §9.1).
Configurable definition (alternative windows later). Distinct from Attention:
Performance = *where on the trend a vendor sits*; Attention = *whether it has
crossed an action threshold*. They reinforce, they do not duplicate.

### 9.5 Attention — colour (separate from Materiality)

`$ at stake` is the magnitude of a **problem**, not of the **vendor** — it
belongs here, never in the materiality composite. Two signals:

- **Operational (the genuinely "now" signal):** state of the open/year-0
  period — unworked / unfinalized / anomalous *right now*.
- **Performance-severity:** same-period YoY **cliff** (prior material,
  current ~0) and **collapse** (≥ threshold decline, not cliff). Thresholds
  tunable. On the truthful complete-year probe this is ~110 cliff + ~188
  collapse (~12% of 2,573) — recomputed same-period at build.

Severity → RED / AMBER / GREEN (thresholded). "$ at stake" (cliff = prior
$ lost; collapse = $ decline) is surfaced in attribution and may optionally
be *selected* as a triage-emphasis lens — documented as Attention, not
Materiality.

**Honest behaviour on real data:** closed periods are 100% finalized, so the
operational signal is mostly clean (correct, not a gap) — performance-
severity is the live differentiator; most vendors are truthfully GREEN with
a meaningful ~12% problem set.

**Lapsed-program-with-activity:** the ingest shows ~0 (programs effectively
all active) — **not shipped now** (no dead detectors); documented to
**auto-activate** when program-deactivation data exists.

### 9.6 Settings area — part of the surface, not navigation

A **slim, glanceable, always-visible encoding bar at the top** that states
the current view in plain language ("Materiality: composite · Performance:
YoY · Colour: Attention · 12-mo window") with controls one click away:
composite-weight sliders, performance definition, colour basis, TTM window,
seat.

- **Not navigation.** Reconciles `docs/06` "no top nav": it *shapes the
  view*, it never routes. It reads as part of the frictionless work surface
  (state always visible, controls in reach), not enterprise chrome.
- **Not a filter.** Settings = *how you see everything*; filters = *which
  subset* and live in the left slider (`docs/06`). The two are kept
  distinct.
- **Absorbs and replaces** the old bottom X/Y/Size toolbar (not both).
- **Per-seat seeded**, session-persistent on override.

### 9.7 Composition with §8

Builds on §8: deterministic, no force-sim, no collision; positions computed;
overlap truthful; the user-drawn exploder is the only de-overlap. §8.2's
triage-*encode* (Manager: aggregate, attention-encoded) vs triage-*filter*
(operator) layering is unchanged — §9 defines *what the encodings are*, §8.2
defines *how they apply per seat*.

### 9.8 Assumptions & risks

- **year-0 = the live open period is the unconfirmed D4 assumption** (Ken
  round-5). If wrong, fall back to FY2026 P1–2 YTD as "now."
- **FY2026 P1–2 is thin** (2 periods) → same-period YoY is real but noisy
  early in the year; acceptable, tunable, improves as periods load.
- **Rank-percentile normalization** for the composite is a deliberate
  choice (unit-free, outlier- and missing-data-robust); documented so it is
  not silently changed.
- Nothing synthetic; blocked categories are inert and labeled, never faked.

### 9.9 Build order

1. **Materiality composite** — Cat 1 + breadth live now; rank-normalized;
   equal-thirds; component attribution. Drives vertical position + size.
2. **Performance X** — same-period YoY; replaces the generic X.
3. **Attention colour** — operational + same-period cliff/collapse,
   thresholds tunable.
4. **Settings bar** — the two definitions + colour basis + TTM window +
   seat; absorbs the bottom toolbar.
5. **Remove the X/Y/Size pickers.**
6. Cat 2 (volume/contract) terms + the lapsed detector **auto-activate**
   when D1/D2 / program-deactivation data arrive — no rework.
