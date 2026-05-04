// Pure-logic permission checks over UserRole and domain enums.
// Used by both API route handlers (server) and UI guards (client).
//
// Rules derived from /docs/02-schema-reference.md §1.5 and /docs/02-schema-reference.md §8.

import { UserRole, AgreementStatus, CalculateResultStatus } from '@vrs/db';

// ─── Atomic capabilities ───────────────────────────────────────────────────

export const canCreateAgreement = (role: UserRole): boolean =>
  role === UserRole.BUYER || role === UserRole.BUYER_DELEGATE;

export const canRunECCalculation = (role: UserRole): boolean =>
  role === UserRole.AP_ANALYST || role === UserRole.AP_MANAGER;

export const canReviewCalculation = (role: UserRole): boolean =>
  role === UserRole.AP_ANALYST || role === UserRole.AP_MANAGER;

// AP_MANAGER only — per §1.5 the manager has "approve calculations" as an extra
export const canApproveCalculation = (role: UserRole): boolean =>
  role === UserRole.AP_MANAGER;

// AP_MANAGER only — per business rule §8.6
export const canFinalizePeriod = (role: UserRole): boolean =>
  role === UserRole.AP_MANAGER;

export const canCreateBatch = (role: UserRole): boolean =>
  role === UserRole.AP_ANALYST || role === UserRole.AP_MANAGER;

export const canRunReport = (role: UserRole): boolean =>
  role !== UserRole.READ_ONLY ? true : true; // all roles including READ_ONLY can run reports

export const canViewVendor = (_role: UserRole): boolean => true;

// ─── Agreement status transitions ─────────────────────────────────────────

const AGREEMENT_TRANSITIONS: Record<
  AgreementStatus,
  Array<{ to: AgreementStatus; allowedRoles: UserRole[] }>
> = {
  [AgreementStatus.SUBMITTED_BY_VENDOR]: [
    { to: AgreementStatus.PRE_NEGOTIATION, allowedRoles: [UserRole.BUYER, UserRole.BUYER_DELEGATE] },
    { to: AgreementStatus.REJECTED, allowedRoles: [UserRole.BUYER, UserRole.BUYER_DELEGATE] },
  ],
  [AgreementStatus.PRE_NEGOTIATION]: [
    { to: AgreementStatus.PENDING_DMM_APPROVAL, allowedRoles: [UserRole.BUYER, UserRole.BUYER_DELEGATE] },
    { to: AgreementStatus.PENDING_AP_APPROVAL, allowedRoles: [UserRole.BUYER, UserRole.BUYER_DELEGATE] }, // low-value / pre-approved skip
    { to: AgreementStatus.CANCELLED, allowedRoles: [UserRole.BUYER, UserRole.BUYER_DELEGATE] },
  ],
  [AgreementStatus.PENDING_DMM_APPROVAL]: [
    { to: AgreementStatus.PENDING_GMM_APPROVAL, allowedRoles: [UserRole.DMM, UserRole.AP_MANAGER] },
    { to: AgreementStatus.PENDING_AP_APPROVAL, allowedRoles: [UserRole.DMM, UserRole.AP_MANAGER] }, // skip GMM
    { to: AgreementStatus.REJECTED, allowedRoles: [UserRole.DMM, UserRole.AP_MANAGER] },
  ],
  [AgreementStatus.PENDING_GMM_APPROVAL]: [
    { to: AgreementStatus.PENDING_AP_APPROVAL, allowedRoles: [UserRole.GMM, UserRole.AP_MANAGER] },
    { to: AgreementStatus.REJECTED, allowedRoles: [UserRole.GMM, UserRole.AP_MANAGER] },
  ],
  [AgreementStatus.PENDING_AP_APPROVAL]: [
    { to: AgreementStatus.ASSIGNED, allowedRoles: [UserRole.AP_ANALYST, UserRole.AP_MANAGER] },
    { to: AgreementStatus.REJECTED, allowedRoles: [UserRole.AP_ANALYST, UserRole.AP_MANAGER] },
  ],
  // Terminal — no outbound transitions
  [AgreementStatus.ASSIGNED]: [
    { to: AgreementStatus.EXPIRED, allowedRoles: [UserRole.AP_ANALYST, UserRole.AP_MANAGER] }, // end-date passed
  ],
  [AgreementStatus.EXPIRED]: [],
  [AgreementStatus.REJECTED]: [],
  [AgreementStatus.CANCELLED]: [],
};

export function canTransitionAgreement(
  role: UserRole,
  fromStatus: AgreementStatus,
  toStatus: AgreementStatus,
): boolean {
  const transitions = AGREEMENT_TRANSITIONS[fromStatus] ?? [];
  return transitions.some((t) => t.to === toStatus && t.allowedRoles.includes(role));
}

export function legalNextStatuses(role: UserRole, fromStatus: AgreementStatus): AgreementStatus[] {
  return (AGREEMENT_TRANSITIONS[fromStatus] ?? [])
    .filter((t) => t.allowedRoles.includes(role))
    .map((t) => t.to);
}

// ─── CalculateResult status transitions ───────────────────────────────────

const CALC_NEXT_STATUS: Partial<Record<CalculateResultStatus, CalculateResultStatus>> = {
  [CalculateResultStatus.OPEN]: CalculateResultStatus.PENDING_REVIEW,
  [CalculateResultStatus.PENDING_REVIEW]: CalculateResultStatus.REVIEWED,
  [CalculateResultStatus.REVIEWED]: CalculateResultStatus.APPROVED,
  [CalculateResultStatus.APPROVED]: CalculateResultStatus.FINALIZED,
};

const CALC_TRANSITION_ROLES: Partial<Record<CalculateResultStatus, UserRole[]>> = {
  [CalculateResultStatus.OPEN]: [UserRole.AP_ANALYST, UserRole.AP_MANAGER], // run E&C
  [CalculateResultStatus.PENDING_REVIEW]: [UserRole.AP_ANALYST, UserRole.AP_MANAGER],
  [CalculateResultStatus.REVIEWED]: [UserRole.AP_MANAGER], // approval is manager-only
  [CalculateResultStatus.APPROVED]: [UserRole.AP_MANAGER], // finalize is manager-only
};

export function canAdvanceCalculation(role: UserRole, fromStatus: CalculateResultStatus): boolean {
  const allowed = CALC_TRANSITION_ROLES[fromStatus];
  return allowed ? allowed.includes(role) : false;
}

export function nextCalculationStatus(fromStatus: CalculateResultStatus): CalculateResultStatus | null {
  return CALC_NEXT_STATUS[fromStatus] ?? null;
}

// ─── Default vendor record tab by role ────────────────────────────────────

export type VendorRecordTab =
  | 'overview'
  | 'intelligence'
  | 'programs'
  | 'calculations'
  | 'agreements'
  | 'invoices'
  | 'activity';

export function defaultVendorRecordTab(role: UserRole): VendorRecordTab {
  switch (role) {
    case UserRole.BUYER:
    case UserRole.BUYER_DELEGATE:
      return 'agreements';
    case UserRole.AP_ANALYST:
      return 'calculations';
    case UserRole.AP_MANAGER:
      return 'overview';
    case UserRole.DMM:
    case UserRole.GMM:
      return 'agreements';
    case UserRole.READ_ONLY:
    default:
      return 'overview';
  }
}

// ─── Read-only guard ───────────────────────────────────────────────────────

export const isReadOnly = (role: UserRole): boolean => role === UserRole.READ_ONLY;

export const canWrite = (role: UserRole): boolean => !isReadOnly(role);
