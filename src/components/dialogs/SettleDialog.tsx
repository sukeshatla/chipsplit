import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, MessageSquare } from 'lucide-react';
import { Field, Input, Modal, MoneyInput, Select } from '../ui';
import { useAction } from '../../app/data';
import { memberShort } from '../../lib/ledger';
import { centsToInput, formatDate, formatMoney, parseMoney, todayISO } from '../../lib/money';
import type { Group } from '../../lib/types';

/** Payment methods worth offering for a currency, most common first. */
function methodsFor(currency: string): string[] {
  if (currency === 'INR') return ['UPI', 'Cash', 'Bank transfer', 'Other'];
  if (currency === 'USD') return ['Cash', 'Zelle', 'Venmo', 'PayPal', 'Other'];
  return ['Cash', 'Bank transfer', 'PayPal', 'Other'];
}

export interface SettleDraft { from?: string; to?: string; cents?: number; sessionId?: string | null }

/**
 * Record a payment in one tap: who pays whom and how much come filled in from the settle-up
 * list, the date is today, and tapping how they paid saves it and closes. Amount, date, people,
 * and a note are one tap away for the times they need changing -- no keyboard until then.
 */
export function SettleDialog({ group, draft, onClose }: { group: Group; draft: SettleDraft | null; onClose(): void }) {
  const { run, busy } = useAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setFrom(draft.from ?? group.members[0]?.id ?? '');
    setTo(draft.to ?? group.members[1]?.id ?? '');
    setAmount(draft.cents ? centsToInput(draft.cents) : '');
    setDate(todayISO()); setNote(''); setError(null);
    // Without a suggested payment there's nothing to confirm, so start with the fields open.
    setEditing(!draft.from || !draft.to || !draft.cents); setNoting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const cents = parseMoney(amount);
  const record = async (method: string) => {
    if (!from || !to || from === to) { setError('Pick two different people'); setEditing(true); return; }
    if (!cents || cents <= 0) { setError('Enter an amount'); setEditing(true); return; }
    const ok = await run((api) => api.addSettlement({
      group_id: group.id, from_member: from, to_member: to, amount_cents: cents,
      method, note: note.trim() || null, session_id: draft?.sessionId ?? null, settled_on: date,
    }), `Payment recorded (${method})`);
    if (ok !== undefined) onClose();
  };

  return (
    <Modal open={!!draft} onClose={onClose} title="Record payment">
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
      {noting && <Input className="mt-3" autoFocus value={note} placeholder="Note (optional)" onChange={(e) => setNote(e.target.value)} />}
      {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}

      <p className="mb-2 mt-4 text-[13px] font-semibold">How was it paid?</p>
      <div className="grid grid-cols-3 gap-2">
        {methodsFor(group.currency).map((m) => (
          <button key={m} type="button" disabled={busy} onClick={() => void record(m)}
            className="h-11 rounded-lg border border-line bg-surface text-sm font-semibold hover:border-felt hover:bg-felt/10 disabled:opacity-50">
            {m}
          </button>
        ))}
      </div>

      {(!editing || !noting) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {!editing && (
            <button type="button" className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => setEditing(true)}>
              <CalendarDays size={13} aria-hidden="true" />Change amount, date, or people
            </button>
          )}
          {!noting && (
            <button type="button" className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => setNoting(true)}>
              <MessageSquare size={13} aria-hidden="true" />Add a note
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
