'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface RoleCardProps {
  email: string;
  name: string;
  analystCode: string | null;
  roleLabel: string;
  roleDescription: string;
}

export function RoleCard({ email, name, analystCode, roleLabel, roleDescription }: RoleCardProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await signIn('credentials', { email, redirect: true, redirectTo: '/' });
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="group relative p-6 bg-white rounded-xl border border-gray-200 shadow-sm text-left
        transition-all duration-200
        hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:border-blue-300
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        disabled:opacity-60 disabled:cursor-wait"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-blue-600 mb-1">
            {roleLabel}
          </div>
          <div className="text-lg font-semibold text-gray-900">{name}</div>
          {analystCode && (
            <div className="text-xs text-gray-500 mt-0.5">Code: {analystCode}</div>
          )}
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{roleDescription}</p>
      <div className="mt-3 text-xs text-gray-400">{email}</div>
    </button>
  );
}
