import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput, Select } from '../ui';
import { useAction } from '../../app/data';
import { centsToInput, parseMoney, todayISO } from '../../lib/money';
import type { Group } from '../../lib/types';

export const METHODS = ['Cash', 'Zelle', 'Venmo', 'UPI', 'PayPal', 'Other'];

export interface SettleDraft { from?: string; to?: string; cents?: number; sessionId?: string | null }

export function SettleDialog({ group, draft, onClose }: { group: Group; draft: SettleDraft | null; onClose(): void }) {
  const { run, busy } = useAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Zelle');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setFrom(draft.from ?? group.members[0]?.id ?? '');
    setTo(draft.to ?? group.members[1]?.id ?? '');
    setAmount(draft.cents ? centsToInput(draft.cents) : '');
    setDate(todayISO()); setNote(''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!from || !to || from === to) { setError('Pick two different people'); return; }
    if (!cents || cents <= 0) { setError('Enter an amount'); return; }
    const ok = await run((api) => api.addSettlement({
      group_id: group.id, from_member: from, to_member: to, amount_cents: cents,
      method, note: note.trim() || null, session_id: draft?.sessionId ?? null, settled_on: date,
    }), 'Payment recorded');
    if (ok !== undefined) onClose();
  };

  return (
    <Modal open={!!draft} onClose={onClose} title="Record a payment"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Record payment</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who paid">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Paid to">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Amount" error={error} className="col-span-2">
          <MoneyInput value={amount} placeholder="0.00" onChange={(e) => { setAmount(e.target.value); setError(null); }} />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
        </Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (optional)" className="col-span-2">
          <Input value={note} placeholder="Last Friday's game" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
