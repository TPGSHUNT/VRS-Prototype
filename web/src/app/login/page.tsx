// Login — role-sim entry. Pick a Role, then a User. Replaced in production by
// Azure Entra ID SAML (the rest of the auth surface stays).
//
// Real-data hygiene (UI filter only — no rows changed):
//  - Process identifiers (Finalize, QUEUE, …) are not people → never listed.
//  - Test/placeholder strings in the real extract (XXXX, Buyer1, emails-as-
//    names, AP logins mis-set as buyers) → not listed (still a Ken question
//    in the DB, just not selectable here).
//  - MDSE roles show real full names; AP roles show the real login handle
//    (no full name exists for AP userids in any extract). No fabrication.

import { prisma, UserRole } from '@vrs/db';
import { RoleUserPicker, type RoleGroup } from './role-user-picker';

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

const PROCESS = new Set(
  [
    'finalize', 'queue', 'upload', 'batch-exec', 's5s5_calculate',
    'unsale create', 'load io', 'update rebate', 'wo upload', 'load est',
  ],
);
const PLACEHOLDER_AS_BUYER = new Set([
  'lscoggin', 'kbanks', 'smorthal', 'areidl', 'ken banks',
]);

function isSelectable(name: string, role: UserRole): boolean {
  const n = name.trim().toLowerCase();
  if (PROCESS.has(n)) return false; // category C — process identifiers
  if (/xxxx/.test(n) || n.includes('@') || n === 'buyer1') return false; // D — test/placeholder
  if (
    (role === UserRole.BUYER || role === UserRole.BUYER_DELEGATE) &&
    PLACEHOLDER_AS_BUYER.has(n)
  ) {
    return false; // D — AP login mis-set in the Buyer column
  }
  return true;
}

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { email: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });

  const groups: RoleGroup[] = ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    users: users
      .filter((u) => u.role === role && isSelectable(u.name, role))
      .map((u) => ({ email: u.email, name: u.name })),
  })).filter((g) => g.users.length > 0);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Vendor Rebate System</h1>
          <p className="mt-2 text-sm text-gray-600">
            Choose a role, then a user, to view the system from that seat.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <RoleUserPicker groups={groups} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Prototype role-sim — no password. Production signs in via Azure
          Entra&nbsp;ID SSO (VRS has no login screen; the system knows the user).
        </p>
      </div>
    </div>
  );
}
