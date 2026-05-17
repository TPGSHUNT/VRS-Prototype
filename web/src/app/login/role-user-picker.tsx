'use client';

import { signIn } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface RoleGroup {
  role: string;
  label: string;
  users: { email: string; name: string }[];
}

const selectCls =
  'w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg ' +
  'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'focus:border-blue-500 transition-colors cursor-pointer disabled:opacity-60';

export function RoleUserPicker({ groups }: { groups: RoleGroup[] }) {
  const [roleIdx, setRoleIdx] = useState(0);
  const group = groups[roleIdx];
  const [email, setEmail] = useState(group?.users[0]?.email ?? '');
  const [loading, setLoading] = useState(false);

  // keep the selected user valid when the role changes
  const userOptions = useMemo(() => group?.users ?? [], [group]);
  const currentEmail = userOptions.some((u) => u.email === email)
    ? email
    : (userOptions[0]?.email ?? '');

  if (groups.length === 0) {
    return <p className="text-sm text-gray-500">No selectable users.</p>;
  }

  const onRole = (i: number) => {
    setRoleIdx(i);
    setEmail(groups[i]?.users[0]?.email ?? '');
  };

  const enter = async () => {
    if (!currentEmail) return;
    setLoading(true);
    await signIn('credentials', {
      email: currentEmail,
      redirect: true,
      redirectTo: '/',
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Role
        </label>
        <select
          className={selectCls}
          value={roleIdx}
          disabled={loading}
          onChange={(e) => onRole(Number(e.target.value))}
        >
          {groups.map((g, i) => (
            <option key={g.role} value={i}>
              {g.label} ({g.users.length})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          User
        </label>
        <select
          className={selectCls}
          value={currentEmail}
          disabled={loading}
          onChange={(e) => setEmail(e.target.value)}
        >
          {userOptions.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={enter}
        disabled={loading || !currentEmail}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5
          bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md
          transition-all duration-200 hover:bg-blue-700 hover:shadow-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-60 disabled:cursor-wait"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Enter
      </button>
    </div>
  );
}
