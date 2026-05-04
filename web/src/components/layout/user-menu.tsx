'use client';

import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABEL: Record<string, string> = {
  AP_ANALYST: 'AP Analyst',
  AP_MANAGER: 'AP Manager',
  BUYER: 'Buyer',
  BUYER_DELEGATE: 'Buyer Delegate',
  DMM: 'District Merch Manager',
  GMM: 'General Merch Manager',
  READ_ONLY: 'Read Only',
};

interface UserMenuProps {
  name: string;
  role: string;
  analystCode: string | null;
}

export function UserMenu({ name, role, analystCode }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="User menu"
        className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg
          transition-all duration-200 hover:shadow-md cursor-pointer"
      >
        <UserIcon className="w-5 h-5" />
        <span className="text-sm font-medium">{name}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{name}</div>
          <div className="text-xs font-normal text-gray-500 mt-0.5">
            {ROLE_LABEL[role] ?? role}
            {analystCode && ` · ${analystCode}`}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ redirectTo: '/login' })}
          className="text-gray-700"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
