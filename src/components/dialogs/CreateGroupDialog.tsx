import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, Search, UserPlus } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal, SelectAll } from '../ui';
import { useAction, useData } from '../../app/data';
import { friendsList, STATUS_LABEL } from '../../lib/ledger';
import { KIND_ICON, KIND_LABEL } from '../GroupKind';
import { AddFriendDialog } from './AddFriendDialog';
import type { GroupKind } from '../../lib/types';

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD'];

// One job per group (SPEC GROUP-1): Poker ('club' in the database), Rummy, or Expense.
const KINDS: { value: GroupKind; body: string }[] = [
  { value: 'club', body: 'Buy-ins and cash-outs' },
  { value: 'rummy', body: 'Points, hand by hand' },
  { value: 'expenses', body: 'Trips, rent, dinners' },
];

/** Three big buttons, side by side even on a phone. */
export function KindPicker({ value, onChange }: { value: GroupKind; onChange(v: GroupKind): void }) {
  return (
    <div role="radiogroup" aria-label="Group type" className="grid grid-cols-3 gap-2">
      {KINDS.map(({ value: v, body }) => {
        const Icon = KIND_ICON[v], on = value === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={clsx('relative flex flex-col items-center rounded-xl border-2 px-1.5 py-3 text-center transition-colors',
              on ? 'border-felt bg-felt/10' : 'border-line hover:bg-surface-2')}>
            {on && <Check size={14} className="absolute right-1.5 top-1.5 text-felt dark:text-gain" aria-hidden="true" />}
            <Icon size={24} className={on ? 'text-felt dark:text-gain' : 'text-ink-2'} aria-hidden="true" />
            <span className="mt-1.5 text-sm font-semibold">{KIND_LABEL[v]}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-ink-2">{body}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Currency as a row of toggle chips instead of a dropdown. */
export function CurrencyPicker({ value, onChange, disabled }: { value: string; onChange(v: string): void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Currency" className="grid grid-cols-6 gap-1.5">
      {CURRENCIES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} disabled={disabled} onClick={() => onChange(c)}
          className={clsx('h-9 rounded-full border text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === c ? 'border-felt bg-felt text-felt-ink' : 'border-line text-ink hover:enabled:bg-surface-2')}>
          {c}
        </button>
      ))}
    </div>
  );
}

/** New group in two short steps (SPEC GROUP-2): what it is, then who's in it. */
export function CreateGroupDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const data = useData();
  const { me } = data;
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
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

  const close = () => { setStep(1); setName(''); setKind('club'); setPicked([]); setQ(''); setError(null); onClose(); };
  const next = () => {
    if (!name.trim()) { setError('Give the group a name'); return; }
    setStep(2);
  };
  const submit = async () => {
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

  const placeholder = kind === 'club' ? 'Friday poker' : kind === 'rummy' ? 'Sunday rummy' : 'Goa trip';

  return (
    <Modal open={open} onClose={close} title={step === 1 ? 'New group' : `Who's in ${name.trim()}?`}
      footer={step === 1
        ? <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-group">Next</Button></>
        : <><Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" loading={busy} onClick={submit}>{picked.length ? `Create with ${picked.length}` : 'Create group'}</Button></>}>
      {step === 1 ? (
        <form id="new-group" className="space-y-4" onSubmit={(e) => { e.preventDefault(); next(); }}>
          <KindPicker value={kind} onChange={setKind} />
          <Field label="Name" error={error}>
            <Input value={name} placeholder={placeholder} enterKeyHint="next" autoComplete="off"
              onChange={(e) => { setName(e.target.value); setError(null); }} />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold">Currency</span>
            <CurrencyPicker value={currency} onChange={setCurrency} />
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
              <Input aria-label="Search friends" className="h-10 pl-8 text-sm" placeholder="Search friends" value={q} enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button onClick={() => setAddingFriend(true)}><UserPlus size={16} aria-hidden="true" />New</Button>
          </div>
          {friends.length === 0 ? (
            <p className="text-[13px] text-ink-2">No friends yet. Add one, or create the group now and add people later.</p>
          ) : (
            <div className="-mx-1 space-y-1">
              <div className="flex justify-end px-1"><SelectAll ids={shown.map((f) => f.key)} picked={picked} onChange={setPicked} /></div>
              {shown.map((f) => {
                const on = picked.includes(f.key);
                return (
                  <button key={f.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f.key)}
                    className={clsx('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                      on ? 'border-felt bg-felt/10' : 'border-transparent hover:bg-surface-2')}>
                    <Avatar name={f.name} src={f.avatar_url} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{f.name}</span>
                      <span className="block text-[11px] text-ink-2">{STATUS_LABEL[f.status]}</span>
                    </span>
                    <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                      on ? 'border-felt bg-felt text-felt-ink' : 'border-line')}>
                      {on && <Check size={14} aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[12px] text-ink-2">You can add more people any time from the Members tab.</p>
        </div>
      )}
      <AddFriendDialog open={addingFriend} onClose={() => setAddingFriend(false)} />
    </Modal>
  );
}
