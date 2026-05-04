'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

type NotificationItem = {
  id: string;
  type: string;
  payload: { message?: string };
  readAt: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  REPORT_COMPLETE: 'Report ready',
  REPORT_FAILED: 'Report failed',
  QUEUE_PENDING: 'Approval queue item',
  AGREEMENT_APPROVED: 'Agreement approved',
  AGREEMENT_REJECTED: 'Agreement rejected',
  PERIOD_CLOSED: 'Period closed',
  TIER_ALERT: 'Tier alert',
  ANOMALY_FLAG: 'Anomaly flagged',
};

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch(`/api/notifications?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NotificationItem[]) => {
        setItems(data);
        setUnreadCount(data.filter((n) => !n.readAt).length);
      })
      .catch(() => {});
  }, [userId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg
          transition-all duration-200 hover:shadow-md cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Notifications</span>
            <span className="text-xs text-gray-500">{unreadCount} unread</span>
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                    ${!n.readAt ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {TYPE_LABEL[n.type] ?? n.type}
                  </div>
                  {n.payload?.message && (
                    <div className="text-xs text-gray-600 mt-0.5">{n.payload.message}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
