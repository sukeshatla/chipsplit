import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bell } from 'lucide-react';
import { useAuth } from '../app/auth';
import { useAction, useData } from '../app/data';
import { notificationLink } from '../lib/ledger';
import { formatDate } from '../lib/money';
import { Button, EmptyState, IconButton, Modal } from './ui';

/** A bell with an unread count, over the lightweight per-group activity log (src/lib change_log). */
export function NotificationsBell() {
  const { api, mode } = useAuth();
  const data = useData();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const { data: entries } = useQuery({ queryKey: ['notifications', mode], queryFn: () => api.loadNotifications(), refetchInterval: 60_000 });

  const seenAt = data.me.notifications_seen_at;
  const items = (entries ?? []).filter((e) => e.actor_id !== data.me.id);
  const unread = items.filter((e) => e.created_at > seenAt).length;
  const groupName = (id: string) => data.groups.find((g) => g.id === id)?.name ?? '';

  return (
    <>
      <IconButton label="Notifications" className="relative" onClick={() => setOpen(true)}>
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Notifications"
        footer={items.length > 0 ? <Button variant="primary" loading={busy} onClick={() => run((api) => api.markNotificationsSeen())}>Mark all as read</Button> : undefined}>
        {items.length === 0 ? (
          <EmptyState icon={<Bell size={28} />} title="Nothing yet" body="Activity from people in your groups shows up here." />
        ) : (
          <div className="-mx-1 max-h-96 space-y-0.5 overflow-y-auto">
            {items.map((e) => (
              <Link key={e.id} to={notificationLink(e)} onClick={() => setOpen(false)}
                className={clsx('block rounded-lg px-2.5 py-2 hover:bg-surface-2', e.created_at > seenAt && 'bg-felt/5')}>
                <p className="text-sm">{e.summary}</p>
                <p className="text-[12px] text-ink-2">{groupName(e.group_id)} · {formatDate(e.created_at, { month: 'short', day: 'numeric' })}</p>
              </Link>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
