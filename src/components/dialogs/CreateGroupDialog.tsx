import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Spade, Receipt, Search } from 'lucide-react';
import { Avatar, Badge, Button, Field, Input, Modal, Select } from '../ui';
import { useAction, useData } from '../../app/data';
import { friendsList, STATUS_LABEL, type FriendStatus } from '../../lib/ledger';
import { AddFriendDialog } from './AddFriendDialog';
import type { GroupKind } from '../../lib/types';

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD'];
const STATUS_TONE: Record<FriendStatus, 'felt' | 'brass' | 'neutral'> = { friend: 'felt', invited: 'brass', guest: 'neutral' };

// A club tracks games only; shared costs go in an Expenses group (or one-on-one).
const KINDS: { value: GroupKind; label: string; body: string; icon: typeof Spade }[] = [
  { value: 'club', label: 'Club', body: 'Poker and rummy nights — tracks games only, not expenses', icon: Spade },
  { value: 'expenses', label: 'Expenses', body: 'Trips, rent, dinners — shared costs, no games', icon: Receipt },
];

export function KindPicker({ value, onChange, disabled }: { value: GroupKind; onChange(v: GroupKind): void; disabled?: boolean }) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2">
      {KINDS.map(({ value: v, label, body, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}
          className={clsx('rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === v ? 'border-felt bg-felt/10' : 'border-line hover:enabled:bg-surface-2')}>
          <Icon size={18} className={value === v ? 'text-felt dark:text-gain' : 'text-ink-2'} aria-hidden="true" />
          <span className="mt-2 block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{body}</span>
        </button>
      ))}
    </div>
  );
}

export function CreateGroupDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const data = useData();
  const { me } = data;
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('club');
  const [currency, setCurrency] = useState(me.default_currency || 'USD');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friends = friendsList(data);
  const shown = friends.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (key: string) => setPicked((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));

  const close = () => { setName(''); setKind('club'); setPicked([]); setQ(''); setError(null); onClose(); };

  const submit = async () => {
    if (!name.trim()) { setError('Give the group a name'); return; }
    const selected = friends.filter((f) => picked.includes(f.key));
    const id = await run(async (api) => {
      const groupId = await api.createGroup({ name: name.trim(), kind, currency });
      for (const f of selected) {
        if (f.contactId) await api.addMemberFromContact(groupId, f.contactId);
        else await api.addMember(groupId, f.name, f.email);
      }
      return groupId;
    }, 'Group created');
    if (id) { close(); nav(`/groups/${id}`); }
  };

  return (
    <Modal open={open} onClose={close} title="New group" wide
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create group</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={error}>
          <Input autoFocus value={name} placeholder={kind === 'club' ? 'Friday night club' : 'Goa trip'} onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">What's it for</span>
          <KindPicker value={kind} onChange={setKind} />
        </div>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Add friends (optional)</span>
            <button type="button" className="text-[13px] font-semibold text-felt dark:text-gain" onClick={() => setAddingFriend(true)}>New friend</button>
          </div>
          {friends.length === 0 ? (
            <p className="text-[13px] text-ink-2">No friends yet — add one, or just create the group and add people after.</p>
          ) : (
            <>
              <div className="relative mb-2">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
                <Input aria-label="Search friends" className="h-9 pl-8 text-sm" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="-mx-1 max-h-48 space-y-1 overflow-y-auto">
                {shown.map((f) => {
                  const on = picked.includes(f.key);
                  return (
                    <button key={f.key} type="button" aria-pressed={on} onClick={() => toggle(f.key)}
                      className={clsx('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                        on ? 'border-felt bg-felt/10' : 'border-transparent hover:bg-surface-2')}>
                      <Avatar name={f.name} src={f.avatar_url} size={28} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                      <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <AddFriendDialog open={addingFriend} onClose={() => setAddingFriend(false)} />
    </Modal>
  );
}
