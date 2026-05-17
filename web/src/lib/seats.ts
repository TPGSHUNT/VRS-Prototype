'use server';

// Seat catalogue for the in-header seat switcher + the SSO entry shim.
// Single source of the persona-filtering rules (was inlined in
// app/login/page.tsx). Real VRS has no login screen — SSO just knows the
// user; this models that as a switchable seat (memory
// project_no_login_seat_switcher, docs/20 P2.3).
//
// Real-data hygiene (UI filter only — no rows changed; still Ken questions
// in the DB, just not offered as a seat):
//  - Process identifiers (Finalize, QUEUE, …) are not people.
//  - Test/placeholder strings in the real extract (XXXX, Buyer1,
//    emails-as-names, AP logins mis-set as buyers).

import { prisma, UserRole } from '@vrs/db';

export interface SeatUser {
  email: string;
  name: string;
}
export interface SeatGroup {
  role: string;
  label: string;
  /** estate seats see the whole field; operator seats default to a slice */
  tier: 'estate' | 'operator';
  users: SeatUser[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  AP_MANAGER: 'AP Manager',
  AP_ANALYST: 'AP Analyst',
  BUYER: 'Buyer',
  BUYER_DELEGATE: 'Buyer Delegate',
  DMM: 'District Merch Manager',
  GMM: 'General Merch Manager',
  READ_ONLY: 'Finance / Audit (read-only)',
};
const ROLE_ORDER: UserRole[] = [
  UserRole.AP_MANAGER,
  UserRole.AP_ANALYST,
  UserRole.BUYER,
  UserRole.BUYER_DELEGATE,
  UserRole.DMM,
  UserRole.GMM,
  UserRole.READ_ONLY,
];
// Mirror lib/bubble-data.ts ESTATE_ROLES so the switcher's tier badge matches
// how the field actually scopes the seat.
const ESTATE = new Set<UserRole>([UserRole.AP_MANAGER, UserRole.READ_ONLY]);

const PROCESS = new Set([
  'finalize', 'queue', 'upload', 'batch-exec', 's5s5_calculate',
  'unsale create', 'load io', 'update rebate', 'wo upload', 'load est',
]);
const PLACEHOLDER_AS_BUYER = new Set([
  'lscoggin', 'kbanks', 'smorthal', 'areidl', 'ken banks',
]);

function isSelectable(name: string, role: UserRole): boolean {
  const n = name.trim().toLowerCase();
  if (PROCESS.has(n)) return false;
  if (/xxxx/.test(n) || n.includes('@') || n === 'buyer1') return false;
  if (
    (role === UserRole.BUYER || role === UserRole.BUYER_DELEGATE) &&
    PLACEHOLDER_AS_BUYER.has(n)
  ) {
    return false;
  }
  return true;
}

export async function getSeatGroups(): Promise<SeatGroup[]> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { email: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
  return ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    tier: ESTATE.has(role) ? ('estate' as const) : ('operator' as const),
    users: users
      .filter((u) => u.role === role && isSelectable(u.name, role))
      .map((u) => ({ email: u.email, name: u.name })),
  })).filter((g) => g.users.length > 0);
}

// SSO entry default: the AP Manager estate seat is the demo showpiece (the
// whole multi-billion-$ field to lasso). Deterministic — first AP_MANAGER by
// name; falls back to any selectable seat so entry never dead-ends.
export async function getDefaultSeatEmail(): Promise<string | null> {
  const mgr = await prisma.user.findFirst({
    where: { active: true, role: UserRole.AP_MANAGER },
    select: { email: true },
    orderBy: { name: 'asc' },
  });
  if (mgr) return mgr.email;
  const groups = await getSeatGroups();
  return groups[0]?.users[0]?.email ?? null;
}
