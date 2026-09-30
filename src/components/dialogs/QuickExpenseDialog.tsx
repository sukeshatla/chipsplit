import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Search, Users } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, Input, Modal } from '../ui';
import { useAction, useData } from '../../app/data';
import { useAuth } from '../../app/auth';
import { friendKey, friendsList, STATUS_LABEL, type FriendStatus } from '../../lib/ledger';
import { AddFriendDialog } from './AddFriendDialog';
import { ExpenseDialog } from './ExpenseDialog';
import type { AppData, Group } from '../../lib/types';

const STATUS_TONE: Record<FriendStatus, 'felt' | 'brass' | 'neutral'> = { friend: 'felt', invited: 'brass', guest: 'neutral' };

function groupNameFor(names: string[]) {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

/**
 * A quick, one-off expense with friends who don't necessarily share an ongoing group ("we ate
 * at a restaurant, one person paid, that's it"). Picks friends, then finds an existing group
 * with exactly that set of people or creates a small one, and hands off to the normal expense
 * form -- so splits, payers, and history all work exactly like any other expense.
 */
export function QuickExpenseDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const data = useData();
  const { mode } = useAuth();
  const qc = useQueryClient();
  const { run, busy } = useAction();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friends = friendsList(data);
  const shown = friends.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const meKey = `u:${data.me.id}`;

  const close = () => { setPicked([]); setQ(''); setGroup(null); setError(null); onClose(); };
  const toggle = (key: string) => setPicked((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));

  const continueToExpense = async () => {
    if (picked.length === 0) { setError('Pick at least one friend'); return; }
    const wanted = new Set([meKey, ...picked]);
    const existing = data.groups.find((g) => g.kind !== 'poker' && g.members.length === wanted.size && g.members.every((m) => wanted.has(friendKey(m))));
    if (existing) { setGroup(existing); return; }

    const selected = friends.filter((f) => picked.includes(f.key));
    const name = groupNameFor(selected.map((f) => f.name));
    const groupId = await run(async (api) => {
      const id = await api.createGroup({ name, kind: 'expenses', currency: data.me.default_currency || 'USD' });
      for (const f of selected) {
        if (f.contactId) await api.addMemberFromContact(id, f.contactId);
        else await api.addMember(id, f.name, f.email);
      }
      return id;
    }, 'Group created');
    if (!groupId) return;
    const fresh = qc.getQueryData<AppData>(['all', mode]);
    const g = fresh?.groups.find((x) => x.id === groupId);
    if (g) setGroup(g);
    else setError("Created the group, but couldn't load it. Try again from Groups.");
  };

  if (group) return <ExpenseDialog group={group} expense={null} open={open} onClose={close} />;

  return (
    <Modal open={open} onClose={close} title="Add expense"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={continueToExpense}>Continue</Button></>}>
      <div className="space-y-4">
        <p className="text-[13px] text-ink-2">Who's this with? We'll find (or start) the right group for it.</p>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
          <Input aria-label="Search friends" className="pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {friends.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title="No friends yet" body="Add a friend first, then split an expense with them."
            action={<Button variant="primary" onClick={() => setAddingFriend(true)}>Add a friend</Button>} />
        ) : (
          <div className="-mx-1 max-h-72 space-y-1 overflow-y-auto">
            {shown.map((f) => {
              const on = picked.includes(f.key);
              return (
                <button key={f.key} type="button" aria-pressed={on} onClick={() => toggle(f.key)}
                  className={clsx('flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    on ? 'border-felt bg-felt/10' : 'border-transparent hover:bg-surface-2')}>
                  <Avatar name={f.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.name}</p>
                    <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="rounded-lg bg-loss/10 px-3 py-2 text-[13px] text-loss">{error}</p>}
      </div>
      <AddFriendDialog open={addingFriend} onClose={() => setAddingFriend(false)} />
    </Modal>
  );
}
