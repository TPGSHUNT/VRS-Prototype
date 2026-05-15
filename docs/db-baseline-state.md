# DB Baseline State — for cross-machine verification

**Captured:** 2026-05-15 from the travel laptop, local Docker `vrs-postgres` (Postgres 16, port 5435).
**Purpose:** When picking this up on the home laptop, run the verification query (bottom of this file) against that machine's DB and diff it against the baseline below to determine whether the DB is the untouched synthetic seed or has diverged / been advanced.

## Provenance note

As of this capture, **no data writes have been made by Claude Code**. This session only started the containers and ran read-only inspection. This is the original synthetic seed produced by `prisma/seed.ts` at migration `20260502010319_init`. Nothing planned (real-data ingest, demo enrichment) has happened yet.

Row UUIDs are generated per seed run, so identity hashing across machines is meaningless — comparison must be **structural/semantic** (counts + distributions below), not row-level.

## Baseline fingerprint

| Key | Baseline value |
|---|---|
| Migration | `20260502010319_init` applied=true (only one) |
| Vendor | 50 |
| User | 7 |
| RebateProgram | 150 (150 active) |
| RebateType | 15 |
| ProgramType | 36 |
| Agreement | 85 |
| RebateVendor | 193 |
| RebateVendorDept | 474 |
| CalculateResult | 2370 |
| CalculateResultAdjustment | 10 |
| RebateTier | 324 |
| Check | 60 |
| Deduction | 20 |
| Invoice | 302 |
| Batch | 3 |
| BatchItem | 120 |
| AcctControlMaster | 28 |
| AnalyticsSummary | 562 |
| FiscalPeriod | 5 |
| Notification | 90 |
| ReportJob | 0 |
| VendorPortalUser | 0 |
| CALC years | `2025` only |
| CALC periods | `1,2,3,4,5` |
| CALC finalEarnings sum / min / max | 59,731,269 / -419 / 71,373 |
| CALC status dist | OPEN:149 PENDING_REVIEW:124 REVIEWED:109 APPROVED:124 FINALIZED:1864 |
| FiscalPeriod closed flags | 2025 P1–P4 closed, P5 open |
| Users | Dana M./DMM/DM · Glen R./GMM/GR · J. Alvarez/BUYER/JA · Lane B./AP_ANALYST/LB · Mark K./AP_MANAGER/MK · Read-Only Auditor/READ_ONLY/EX · Robin W./BUYER_DELEGATE/RW |
| Agreement status dist | SUBMITTED_BY_VENDOR:6 PRE_NEGOTIATION:10 PENDING_GMM_APPROVAL:1 PENDING_AP_APPROVAL:8 ASSIGNED:50 EXPIRED:5 REJECTED:3 CANCELLED:2 |
| Agreement notes populated | 0 / 85 |
| Agreement endDate range | 2025-01-31 .. 2027-01-31 |
| Analytics anomaly / tier / PYvol-not-null | 5 / 7 / 562 |
| Vendor number range | 1045 .. 315962 |
| Vendor sample names (first 5 by num) | PEPSICO BEVERAGE SALES LLC \| COCA COLA BOTTLERS \| DR PEPPER SNAPPLE GROUP \| PROCTER & GAMBLE-EDI \| ROLLING FRITO LAY SALES LP |

## Interpretation guide (what divergence means)

| Observation on the other machine | Conclusion |
|---|---|
| All values match baseline exactly | Untouched synthetic seed. Safe to treat as the known starting point. |
| Counts match but UUIDs differ | Normal — same seed re-run. Still the baseline structurally. |
| `CALC years` includes 2024 and/or 2026, CalculateResult >> 2370 | Real-data ingest has run. **Not** the baseline. |
| Vendor count >> 50, or names not the synthetic beverage set | Real-data ingest or vendor enrichment has run. |
| `Agreement notes populated` > 0 | Demo enrichment (planted Vera narratives) has run. |
| `finalEarnings min` strongly negative across many rows | Real legacy sign convention present (real data ingested) — synthetic seed is mostly positive. |
| Migration list has entries beyond `20260502010319_init` | Schema has been advanced (Prisma migrate run). Reconcile schema before trusting data. |
| Any count differs by a small amount with same migration | Manual/ad-hoc writes occurred. Investigate before building on it. |

## Verification query (run on the other machine)

```
docker exec vrs-postgres psql -U vrs -d vrs -t -A -F'|' -c "
SELECT 'MIGRATION', migration_name||' applied='||(finished_at IS NOT NULL) FROM _prisma_migrations
UNION ALL SELECT 'COUNT Vendor', count(*)::text FROM \"Vendor\"
UNION ALL SELECT 'COUNT CalculateResult', count(*)::text FROM \"CalculateResult\"
UNION ALL SELECT 'COUNT Agreement', count(*)::text FROM \"Agreement\"
UNION ALL SELECT 'CALC years', string_agg(DISTINCT \"fiscalYear\"::text, ',' ORDER BY \"fiscalYear\"::text) FROM \"CalculateResult\"
UNION ALL SELECT 'CALC finalEarnings sum/min/max', round(sum(\"finalEarnings\"))||' / '||round(min(\"finalEarnings\"))||' / '||round(max(\"finalEarnings\")) FROM \"CalculateResult\"
UNION ALL SELECT 'AGMT notes populated', count(*) FILTER (WHERE notes IS NOT NULL AND notes<>'')||' / '||count(*) FROM \"Agreement\"
UNION ALL SELECT 'VENDOR sample names', string_agg(name,' | ') FROM (SELECT name FROM \"Vendor\" ORDER BY \"vendorNumber\" LIMIT 5) q
;"
```

For the full fingerprint, re-run the comprehensive query from the session that produced this file (all 23 table counts + every discriminator above).

## To make this travel

This file must be committed so the home laptop sees it:

```
git add docs/db-baseline-state.md && git commit -m "Add DB baseline-state manifest for cross-machine verification"
```
