import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Spade, Receipt, Layers } from 'lucide-react';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useAction, useData } from '../../app/data';
import type { GroupKind } from '../../lib/types';

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD'];

const KINDS: { value: GroupKind; label: string; body: string; icon: typeof Spade }[] = [
  { value: 'poker', label: 'Poker', body: 'Game days with buy-ins and cash-outs', icon: Spade },
  { value: 'expenses', label: 'Expenses', body: 'Trips, rent, dinners', icon: Receipt },
  { value: 'mixed', label: 'Both', body: 'Games plus shared costs', icon: Layers },
];

export function KindPicker({ value, onChange }: { value: GroupKind; onChange(v: GroupKind): void }) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-2">
      {KINDS.map(({ value: v, label, body, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={clsx('rounded-xl border p-3 text-left transition-colors',
            value === v ? 'border-felt bg-felt/10' : 'border-line hover:bg-surface-2')}>
          <Icon size={18} className={value === v ? 'text-felt dark:text-gain' : 'text-ink-2'} aria-hidden="true" />
          <span className="mt-2 block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{body}</span>
        </button>
      ))}
    </div>
  );
}

export function CreateGroupDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('poker');
  const [currency, setCurrency] = useState(me.default_currency || 'USD');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setError('Give the group a name'); return; }
    const id = await run((api) => api.createGroup({ name: name.trim(), kind, currency }), 'Group created');
    if (id) { onClose(); setName(''); nav(`/groups/${id}`); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New group"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create group</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={error}>
          <Input autoFocus value={name} placeholder="Friday poker" onChange={(e) => { setName(e.target.value); setError(null); }}
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
      </div>
    </Modal>
  );
}
