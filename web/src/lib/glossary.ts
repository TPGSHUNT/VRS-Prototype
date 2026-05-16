// VRS shared glossary + label module  (Phase 0, P0.8)
//
// Single source of truth for two things that must NOT drift across surfaces:
//   1. The Rebate Program ≠ Agreement ≠ Contract distinction (15-handoff P2 / G7).
//   2. Earnings presentation per Decision ① — NEVER render a naked signed
//      number; always a labeled "$X earned" / "$Y owed to DG". The legacy
//      negative convention is shown only in the explicit "Accounting view".
//
// Pure module — no framework imports. Every later surface (bubble tooltips,
// vendor record, Vera prompts, KPI strip) must format earnings through here.
//
// NOTE: existing components (bubble-data.ts / page.tsx KPI strip) are NOT yet
// rewired to this — that is a Phase 1 task (app code, gated on the modified-Next
// deep read per web/AGENTS.md). Synthetic seed earnings are normalized positive,
// so there is no display bug today; the contract matters once real
// negative-convention data is ingested (Phase 3).

// ─── Domain vocabulary (enforce everywhere a term is shown) ─────────────────

export const TERMS = {
  agreement: {
    label: 'Agreement',
    plural: 'Agreements',
    // MDSE-side. The contractual record of what a vendor committed to pay.
    gloss:
      'The MDSE-side contractual record a Buyer negotiates with a vendor. ' +
      'Becomes a Rebate Program once approved through the Approval Queue.',
  },
  rebateProgram: {
    label: 'Rebate Program',
    plural: 'Rebate Programs',
    // AP-side. The operational record of calculated earnings/invoicing.
    gloss:
      'The AP-side operational record: earnings calculation, batching, ' +
      'invoicing. Created from an approved Agreement (or stands alone).',
  },
  // "Contract" is NOT a synonym for either. Reserve strictly for the Damages /
  // Unsaleables subsystem's Damage Contracts. Do not use it loosely in UI copy.
  contract: {
    label: 'Contract',
    plural: 'Contracts',
    gloss:
      'Reserved term — Damage Contracts in the Unsaleables/Damages subsystem. ' +
      'NOT a synonym for Agreement or Rebate Program.',
  },
} as const;

// Guard for code review / dev assertions: flags loose "contract" usage where an
// Agreement or Rebate Program is actually meant.
export function assertTermUsage(text: string): string[] {
  const warnings: string[] = [];
  if (/\bcontract(s)?\b/i.test(text) && !/damage/i.test(text)) {
    warnings.push(
      '"contract" used outside the Damages context — did you mean Agreement or Rebate Program?',
    );
  }
  return warnings;
}

// ─── Earnings presentation (Decision ①) ─────────────────────────────────────

export type EarningsView = 'normalized' | 'accounting';

function money(abs: number): string {
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

/**
 * Label a NORMALIZED earnings value (positive = value to DG / earned).
 * Never returns a bare signed number. Use for every default surface.
 *   85_000  -> "$85.0K earned"
 *  -2_000  -> "$2.0K owed to DG"   (rare: net-negative after adjustments)
 *       0  -> "$0 earned"
 */
export function formatEarnings(normalized: number): string {
  if (normalized < 0) return `${money(Math.abs(normalized))} owed to DG`;
  return `${money(normalized)} earned`;
}

/** Short variant for dense contexts (axis ticks, chips): no verb, no sign. */
export function formatEarningsShort(normalized: number): string {
  return money(Math.abs(normalized));
}

/**
 * The "Accounting view" drill ONLY — renders the legacy/source sign convention
 * verbatim (negative = vendor owes DG), matching the legacy Period Accounting
 * Summary so an AP user sees their familiar figure. Pass finalEarningsLegacy.
 */
export function formatAccounting(legacySigned: number): string {
  const sign = legacySigned < 0 ? '-' : '';
  return `${sign}${money(Math.abs(legacySigned))}`;
}

/** Caption to attach wherever the Accounting view is shown. */
export const ACCOUNTING_VIEW_NOTE =
  'Accounting view — legacy sign convention (negative = vendor owes DG), ' +
  'matches the Period Accounting Summary.';

// ─── "Active" predicate seam (Ken K7) ───────────────────────────────────────
// Single definition of "active" so the answer to K7 is a one-line change here,
// not a hunt across the codebase. Today: the model's `active` flag. When Ken
// confirms the real predicate (open rebate in current FY? not expired?), encode
// it ONLY here.
export function isActiveVendorRecord(r: { active: boolean }): boolean {
  return r.active;
}
