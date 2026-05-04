// Login page — role-sim entry. No password; click a role card to sign in as that user.
// Replaced in production by Azure Entra ID SAML; the rest of the auth surface stays.

import { prisma, UserRole } from '@vrs/db';
import { RoleCard } from './role-card';

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  AP_ANALYST: 'Manage rebate programs, calculations, and batches for assigned programs',
  AP_MANAGER: 'All AP Analyst capabilities + approve calculations and finalize periods',
  BUYER: 'Create and edit agreements in own portfolio; initiate Move Forward',
  BUYER_DELEGATE: 'Same as Buyer, scoped to explicitly assigned vendors only',
  DMM: 'District Merchandise Manager — approve agreements in your chain',
  GMM: 'General Merchandise Manager — approve escalated agreements',
  READ_ONLY: 'Full visibility, no write access — finance, audit, executive',
};

const ROLE_LABELS: Record<UserRole, string> = {
  AP_ANALYST: 'AP Analyst',
  AP_MANAGER: 'AP Manager',
  BUYER: 'Buyer',
  BUYER_DELEGATE: 'Buyer Delegate',
  DMM: 'District Merch Manager',
  GMM: 'General Merch Manager',
  READ_ONLY: 'Read Only',
};

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Vendor Rebate System</h1>
          <p className="text-gray-600">Pick a role to demo the system from that perspective</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <RoleCard
              key={user.id}
              email={user.email}
              name={user.name}
              analystCode={user.analystCode}
              roleLabel={ROLE_LABELS[user.role]}
              roleDescription={ROLE_DESCRIPTIONS[user.role]}
            />
          ))}
        </div>

        <div className="mt-8 mx-auto max-w-2xl p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
          <p className="text-sm text-blue-900">
            <strong>Prototype role-sim.</strong> No password — clicking a card signs you in as
            that user. Replaced by Azure Entra ID SAML in production.
          </p>
        </div>
      </div>
    </div>
  );
}
