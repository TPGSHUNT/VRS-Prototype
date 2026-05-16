# DB Baseline State — for cross-machine verification

**Captured:** 2026-05-16 from the Phase-0 reseed, local Docker `vrs-postgres` (Postgres 16, port 5435).
**Supersedes** the 2026-05-15 capture (which was the pre-Phase-0 synthetic seed at migration `20260502010319_init`, 5 periods / 4-4-5 / positive-only earnings).
**Purpose:** run the verification query (bottom) on another machine and diff against the baseline below to tell whether the DB is the Phase-0 synthetic seed or has diverged / advanced (real-data ingest, demo enrichment, schema change).

## Provenance note

This is the **Phase-0 synthetic seed** produced by `prisma/seed.ts` at migration **`20260516132320_phase0_baseline`** (the stale `20260502010319_init` was deleted and consolidated into this single clean baseline — docs/20 P0.7). Still 100% synthetic, single fiscal year **FY2025**, now **12 periods / 4-5-4** (P01–P11 closed, P12 open). No real-data ingest, no demo-narrative enrichment.

The seed RNG is deterministic (`makeRng(42)`), so **counts, distributions, and numeric ranges are reproducible across machines/runs** — only row UUIDs and `createdAt`/`updatedAt` timestamps differ. Comparison is structural/semantic (below), not row-level.

Earnings sign (Decision ①): `finalEarnings` is **normalized positive** (= value to DG); `finalEarningsLegacy` holds the **legacy-signed** mirror (negative = vendor owes DG). In the synthetic seed `finalEarningsLegacy == -finalEarnings` exactly; on real ingest (Phase 3) that relationship no longer holds (real per-component signs).

## Baseline fingerprint

| Key | Baseline value |
|---|---|
| Migration | `20260516132320_phase0_baseline` (only one, applied) |
| Vendor | 50 |
| User | 7 |
| ProgramType | 36 |
| RebateType | 15 |
| Agreement | 85 |
| RebateProgram | 150 |
| RebateTier | 321 |
| RebateVendor | 192 |
| RebateVendorDept | 471 |
| CalculateResult | 5652 |
| CalculateResultAdjustment | 10 |
| AcctControlMaster | 28 |
| Batch | 3 |
| BatchItem | 120 |
| Check | 60 |
| Deduction | 20 |
| Invoice | 331 |
| AnalyticsSummary | 560 |
| Notification | 90 |
| FiscalPeriod | 12 |
| CALC periods present | `1..12` |
| CALC finalEarnings sum / min / max | 146,283,589 / -1,560 / 71,892 |
| CALC finalEarningsLegacy sum | -146,283,589 (exact mirror of finalEarnings) |
| CALC status dist | APPROVED:119 FINALIZED:5155 OPEN:136 PENDING_REVIEW:111 REVIEWED:131 |
| FiscalPeriod closed | P1–P11 closed; **P12 open** |
| Vendor number range | 1041 .. 315965 |
| Vendor.apNumber | 9-digit zero-padded (e.g. `000001041`); all 50 set |
| Vendor.ipNumber | NUMBER(5); all 50 set |
| RebateVendorDept.ipVendorNum | set on 471 / 471 |
| RebateProgram extract dates | 150/150 set; extractBegin (`2024-12-29`) < rebate start (`2025-02-02`) |
| Agreement.agmtId range | 370900 .. 372754 (sequence-shaped, not 1..N) |
| Agreement status dist | ASSIGNED:50 CANCELLED:2 EXPIRED:5 PENDING_AP_APPROVAL:8 PENDING_GMM_APPROVAL:1 PRE_NEGOTIATION:10 REJECTED:3 SUBMITTED_BY_VENDOR:6 |
| Vendor sample (first 5 by num) | PEPSICO BEVERAGE SALES LLC \| COCA COLA BOTTLERS \| DR PEPPER SNAPPLE GROUP \| PROCTER & GAMBLE-EDI \| ROLLING FRITO LAY SALES LP |

## Interpretation guide (what divergence means)

| Observation on the other machine | Conclusion |
|---|---|
| All values match exactly | Phase-0 synthetic seed, untouched. Safe known starting point. |
| Counts match, UUIDs differ | Normal — same deterministic seed re-run. Still the baseline. |
| Migration is `20260502010319_init` / FiscalPeriod = 5 / CALC periods `1..5` | **Pre-Phase-0** DB. Run the Phase-0 migrate + reseed before building on it. |
| FiscalPeriod ≠ 12, or periods not `1..12`, or P12 not open | Not the Phase-0 baseline — calendar diverged. Investigate. |
| `finalEarningsLegacy` all NULL | Pre-Phase-0 seed (field didn't exist) or a custom load. Not baseline. |
| `finalEarningsLegacy` sum ≠ -(finalEarnings sum) | Real-data ingest has run (real per-component signs) — **not** synthetic. |
| CALC periods include years ≠ 2025, CalculateResult ≫ 5652 | Real multi-year ingest (Phase 3) has run. Not baseline. |
| Vendor ≫ 50 or names not the synthetic beverage set | Real-data / vendor enrichment has run. |
| `Agreement notes` populated, or planted narratives | Demo enrichment (Vera narratives) has run. |
| Migration list beyond `20260516132320_phase0_baseline` | Schema advanced. Reconcile schema before trusting data. |
| Small count delta, same migration | Manual/ad-hoc writes. Investigate before building on it. |

## Verification query (run on the other machine)

```
docker exec vrs-postgres psql -U vrs -d vrs -t -A -F'|' -c "
SELECT 'MIGRATION', migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
UNION ALL SELECT 'COUNT FiscalPeriod', count(*)::text FROM \"FiscalPeriod\"
UNION ALL SELECT 'COUNT CalculateResult', count(*)::text FROM \"CalculateResult\"
UNION ALL SELECT 'COUNT Vendor', count(*)::text FROM \"Vendor\"
UNION ALL SELECT 'CALC periods', string_agg(DISTINCT \"fiscalPeriod\"::text, ',' ORDER BY \"fiscalPeriod\"::text) FROM \"CalculateResult\"
UNION ALL SELECT 'CALC final sum/min/max', round(sum(\"finalEarnings\"))||' / '||round(min(\"finalEarnings\"))||' / '||round(max(\"finalEarnings\")) FROM \"CalculateResult\"
UNION ALL SELECT 'CALC legacy sum', round(sum(\"finalEarningsLegacy\"))::text FROM \"CalculateResult\"
UNION ALL SELECT 'FP closed', string_agg(\"fiscalPeriod\"::text, ',' ORDER BY \"fiscalPeriod\") FILTER (WHERE \"isClosed\") FROM \"FiscalPeriod\"
UNION ALL SELECT 'Agmt id range', min(\"agmtId\")||'..'||max(\"agmtId\") FROM \"Agreement\"
UNION ALL SELECT 'VENDOR sample', string_agg(name,' | ') FROM (SELECT name FROM \"Vendor\" ORDER BY \"vendorNumber\" LIMIT 5) q
;"
```

Expected: migration `20260516132320_phase0_baseline`, FiscalPeriod 12, CalculateResult 5652, Vendor 50, CALC periods `1..12`, final sum `146283589`, legacy sum `-146283589`, FP closed `1..11`, Agmt id `370900..372754`, beverage vendor sample.

## Single-machine note (2026-05-16)

The two-laptop premise behind this file is **retired**: David is on the home
laptop through the demo, and that machine is the demo box (see memory
`project_single_demo_machine`). This fingerprint is no longer "cross-machine
verification" — keep it only as a **self sanity-check**: after any reset/reseed,
diff the verification query against the baseline to confirm the DB is the
expected Phase-0 state before building or demoing on it. Commit/push remains
worthwhile as backup + history, not as a transport mechanism.
