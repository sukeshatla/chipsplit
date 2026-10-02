import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowRight, CalendarDays, Check } from 'lucide-react';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea } from '../ui';
import { useAction } from '../../app/data';
import { memberShort } from '../../lib/ledger';
import { centsToInput, formatDate, formatMoney, parseMoney, todayISO } from '../../lib/money';
import type { Group } from '../../lib/types';

/** Online (Zelle, UPI, Venmo...) is the usual way, so it's first and the default. */
const METHODS = ['Online', 'Cash'] as const;

export interface SettleDraft { from?: string; to?: string; cents?: number; sessionId?: string | null }

/**
 * Record a payment with as little as one tap on Save: who pays whom and how much come filled in
 * from the settle-up list, the date is today, and the method defaults to Online (or Cash).
 * Amount, date, and people are behind a link for the times they need changing; the note box is
 * there but doesn't open the keyboard until tapped.
 */
export function SettleDialog({ group, draft, onClose }: { group: Group; draft: SettleDraft | null; onClose(): void }) {
  const { run, busy } = useAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Online');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setFrom(draft.from ?? group.members[0]?.id ?? '');
    setTo(draft.to ?? group.members[1]?.id ?? '');
    setAmount(draft.cents ? centsToInput(draft.cents) : '');
    setDate(todayISO()); setNote(''); setMethod('Online'); setError(null);
    // Without a suggested payment there's nothing to confirm, so start with the fields open.
    setEditing(!draft.from || !draft.to || !draft.cents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const cents = parseMoney(amount);
  const record = async () => {
    if (!from || !to || from === to) { setError('Pick two different people'); setEditing(true); return; }
    if (!cents || cents <= 0) { setError('Enter an amount'); setEditing(true); return; }
    const ok = await run((api) => api.addSettlement({
      group_id: group.id, from_member: from, to_member: to, amount_cents: cents,
      method, note: note.trim() || null, session_id: draft?.sessionId ?? null, settled_on: date,
    }), 'Payment recorded');
    if (ok !== undefined) onClose();
  };

  return (
    <Modal open={!!draft} onClose={onClose} title="Record payment"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={() => void record()}><Check size={16} aria-hidden="true" />Save</Button>
      </>}>
      {!editing ? (
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm">
            <b className="truncate font-semibold text-loss">{from && memberShort(group, from)}</b>
            <ArrowRight size={14} className="shrink-0 text-ink-2" aria-label="pays" />
            <b className="truncate font-semibold text-gain">{to && memberShort(group, to)}</b>
          </p>
          <p className="amount mt-0.5 font-display text-3xl font-medium">{cents ? formatMoney(cents, group.currency) : '—'}</p>
          <p className="mt-0.5 text-[12px] text-ink-2">{date === todayISO() ? 'Today' : formatDate(date)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid">
            <Select value={from} onChange={(e) => { setFrom(e.target.value); setError(null); }}>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Paid to">
            <Select value={to} onChange={(e) => { setTo(e.target.value); setError(null); }}>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount">
            <MoneyInput currency={group.currency} value={amount} placeholder="0.00" onChange={(e) => { setAmount(e.target.value); setError(null); }} />
          </Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      )}
      {!editing && (
        <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => setEditing(true)}>
          <CalendarDays size={13} aria-hidden="true" />Change amount, date, or people
        </button>
      )}
      {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <span className="text-[13px] font-semibold">Method</span>
        <div role="radiogroup" aria-label="How it was paid" className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
          {METHODS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
              className={clsx('h-8 rounded-md px-4 text-[13px] font-semibold', method === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-2')}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <Textarea className="mt-3 min-h-[64px]" value={note} placeholder="Note (optional)" onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
