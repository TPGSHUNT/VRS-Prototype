# Bubble field — metric definitions

The work-surface bubble field exposes five metrics that the user can assign to the X axis, Y axis, or bubble size via the toolbar selectors.

Source of truth: `web/src/lib/bubble-data.ts` (function `getBubbleData`, lines 88–175).

| Metric | Label (UI) | Type | Calculation |
|---|---|---|---|
| `contractValue` | Contract value | $ | Sum of `Agreement.estimatedValue` across the vendor's in-flight agreements¹ |
| `grossVolume` | Gross commercial volume | $ | Sum of `AnalyticsSummary.transactionVolume` across all the vendor's summaries |
| `annualEarnings` | Annual rebate earnings | $ | Sum of `CalculateResult.finalEarnings` across all the vendor's calculate results |
| `activeAgreements` | Active agreements | count | Count of the vendor's agreements with an in-flight status¹ |
| `activePrograms` | Active programs | count | Count of `RebateVendor` rows whose linked `RebateProgram.active = true` |

¹ **In-flight agreement statuses:** `SUBMITTED_BY_VENDOR`, `PRE_NEGOTIATION`, `PENDING_DMM_APPROVAL`, `PENDING_GMM_APPROVAL`, `PENDING_AP_APPROVAL`, `ASSIGNED`. Excludes finalized, closed, rejected, and expired agreements.

## Open questions for Ken

- **`annualEarnings` / `grossVolume` time scope.** Both are summed across every fiscal period present in the data, but the labels read as current-year. Decision needed: relabel ("Lifetime rebate earnings", "Lifetime commercial volume") or filter to the current/last fiscal year.
- **`Agreement.estimatedValue` semantics.** The schema defines it as `Decimal(15,2)` with no comment, and the docs don't say whether it represents projected purchase spend, projected rebate dollars, or another quantity. Whichever it is determines what `contractValue` actually means on the bubble field.
