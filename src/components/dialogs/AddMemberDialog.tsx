import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, Field, Input, Modal, Tabs } from '../ui';
import { useAction, useData } from '../../app/data';
import { STATUS_LABEL, statusFromKey, friendKey } from '../../lib/ledger';
import type { Group } from '../../lib/types';

export function AddMemberDialog({ group, open, onClose, onAdded }: { group: Group; open: boolean; onClose(): void; onAdded?(id: string): void }) {
  const data = useData();
  const { run, busy } = useAction();
  const [tab, setTab] = useState<'friend' | 'new'>('friend');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inGroup = useMemo(() => new Set(group.members.map((m) => m.contact_id).filter((x): x is string => !!x)), [group.members]);
  const available = data.contacts.filter((c) => !inGroup.has(c.id));

  const addExisting = async (contactId: string) => {
    const id = await run((api) => api.addMemberFromContact(group.id, contactId), 'Added');
    if (id) { onAdded?.(id); onClose(); }
  };

  const submit = async () => {
    const n = name.trim();
    if (!n) { setError('Enter a name'); return; }
    if (group.members.some((m) => m.name.toLowerCase() === n.toLowerCase())) { setError('Someone in this group already has that name'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('That email looks incomplete'); return; }
    const id = await run((api) => api.addMember(group.id, n, email.trim() || null), `${n} added`);
    if (id) { onAdded?.(id); setName(''); setEmail(''); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add to ${group.name}`}
      footer={tab === 'new' ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Add friend</Button></> : undefined}>
      <div className="space-y-4">
        <Tabs<'friend' | 'new'> tabs={[{ value: 'friend', label: 'Your friends' }, { value: 'new', label: 'New person' }]} value={tab} onChange={setTab} />

        {tab === 'friend' ? (
          available.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-ink-2">
              {data.contacts.length === 0 ? "You haven't added any friends yet — use “New person”." : 'Everyone in your friends list is already in this group.'}
            </p>
          ) : (
            <div className="-mx-1 max-h-72 space-y-1 overflow-y-auto">
              {available.map((c) => {
                const status = statusFromKey(friendKey(c));
                return (
                  <button key={c.id} disabled={busy} onClick={() => addExisting(c.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50">
                    <Avatar name={c.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <Badge tone={status === 'friend' ? 'felt' : status === 'invited' ? 'brass' : 'neutral'}>{STATUS_LABEL[status]}</Badge>
                    </div>
                    <UserPlus size={16} className="shrink-0 text-ink-2" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <>
            <Field label="Name" error={error}>
              <Input autoFocus value={name} placeholder="Ravi" onChange={(e) => { setName(e.target.value); setError(null); }} />
            </Field>
            <Field label="Google email (optional)" hint="When they sign in with this email, they'll see this group and their balances. They're also saved to your friends list.">
              <Input type="email" value={email} placeholder="ravi@gmail.com" onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
