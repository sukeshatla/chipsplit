import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button, Field, Input, Modal, MoneyInput, Select, Tabs, Avatar } from '../ui';
import { useAction, useData } from '../../app/data';
import { centsToInput, formatMoney, parseMoney, splitByWeights, splitEqual, todayISO } from '../../lib/money';
import { myMemberId } from '../../lib/ledger';
import type { Expense, Group, Split } from '../../lib/types';

export const CATEGORIES = ['general', 'food', 'drinks', 'lodging', 'transport', 'housing', 'utilities', 'household', 'fun', 'poker'];
type SplitMode = 'equal' | 'exact' | 'percent';

export function ExpenseDialog({ group, expense, open, onClose }: { group: Group; expense: Expense | null; open: boolean; onClose(): void }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const mine = myMemberId(group, me.id) ?? group.members[0]?.id ?? '';
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('general');
  const [multiPay, setMultiPay] = useState(false);
  const [payer, setPayer] = useState(mine);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<SplitMode>('equal');
  const [included, setIncluded] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!expense) {
      setDescription(''); setAmount(''); setDate(todayISO()); setCategory(group.kind === 'poker' ? 'food' : 'general');
      setMultiPay(false); setPayer(mine); setPayAmounts({});
      setMode('equal'); setIncluded(group.members.map((m) => m.id)); setValues({});
      return;
    }
    setDescription(expense.description); setAmount(centsToInput(expense.amount_cents));
    setDate(expense.spent_on); setCategory(expense.category);
    setMultiPay(expense.payers.length > 1);
    setPayer(expense.payers[0]?.member_id ?? mine);
    setPayAmounts(Object.fromEntries(expense.payers.map((p) => [p.member_id, centsToInput(p.amount_cents)])));
    const amts = expense.shares.map((s) => s.amount_cents);
    const isEqual = amts.length > 0 && Math.max(...amts) - Math.min(...amts) <= 1;
    setMode(isEqual ? 'equal' : 'exact');
    setIncluded(expense.shares.map((s) => s.member_id));
    setValues(Object.fromEntries(expense.shares.map((s) => [s.member_id, centsToInput(s.amount_cents)])));
    // Initialize only when the dialog opens, so a background refresh can't wipe a half-filled form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const total = parseMoney(amount) ?? 0;
  const exactSum = group.members.reduce((a, m) => a + (parseMoney(values[m.id]) ?? 0), 0);
  const pctSum = group.members.reduce((a, m) => a + (Number(values[m.id]) || 0), 0);
  const paySum = group.members.reduce((a, m) => a + (parseMoney(payAmounts[m.id]) ?? 0), 0);

  function buildShares(): Split[] | string {
    if (mode === 'equal') {
      if (included.length === 0) return 'Pick at least one person to split with';
      return splitEqual(total, group.members.map((m) => m.id).filter((id) => included.includes(id)));
    }
    if (mode === 'exact') {
      if (exactSum !== total) return `Shares add up to ${formatMoney(exactSum, group.currency)}, not ${formatMoney(total, group.currency)}`;
      return group.members.map((m) => ({ member_id: m.id, amount_cents: parseMoney(values[m.id]) ?? 0 })).filter((s) => s.amount_cents > 0);
    }
    if (Math.abs(pctSum - 100) > 0.001) return `Percentages add up to ${Math.round(pctSum * 100) / 100}%, not 100%`;
    return splitByWeights(total, group.members.map((m) => ({ id: m.id, weight: Number(values[m.id]) || 0 })));
  }

  function buildPayers(): Split[] | string {
    if (!multiPay) return [{ member_id: payer, amount_cents: total }];
    if (paySum !== total) return `Payments add up to ${formatMoney(paySum, group.currency)}, not ${formatMoney(total, group.currency)}`;
    return group.members.map((m) => ({ member_id: m.id, amount_cents: parseMoney(payAmounts[m.id]) ?? 0 })).filter((p) => p.amount_cents > 0);
  }

  const submit = async () => {
    if (!description.trim()) { setError('Add a description'); return; }
    if (total <= 0) { setError('Enter an amount'); return; }
    const payers = buildPayers();
    if (typeof payers === 'string') { setError(payers); return; }
    const shares = buildShares();
    if (typeof shares === 'string') { setError(shares); return; }
    const ok = await run((api) => api.saveExpense({
      group_id: group.id, description: description.trim(), category, amount_cents: total, spent_on: date, payers, shares,
    }, expense?.id), expense ? 'Expense updated' : 'Expense added');
    if (ok !== undefined) onClose();
  };

  const remaining = mode === 'exact' ? total - exactSum : null;

  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Edit expense' : 'Add an expense'} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{expense ? 'Save changes' : 'Add expense'}</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Description" className="col-span-2">
            <Input autoFocus value={description} placeholder="Pizza and drinks" onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Amount"><MoneyInput value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Category" className="col-span-2 md:col-span-1">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Paid by" className="col-span-2 md:col-span-3">
            <div className="flex gap-2">
              {!multiPay && (
                <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
                  {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              )}
              <Button type="button" variant={multiPay ? 'primary' : 'secondary'} onClick={() => setMultiPay((v) => !v)} className={multiPay ? 'w-full' : ''}>
                {multiPay ? 'Several people paid' : 'Several people'}
              </Button>
            </div>
          </Field>
        </div>

        {multiPay && (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[13px] font-semibold">How much each person paid</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-24 truncate text-sm">{m.name}</span>
                  <MoneyInput className="flex-1" value={payAmounts[m.id] ?? ''} placeholder="0"
                    onChange={(e) => setPayAmounts((p) => ({ ...p, [m.id]: e.target.value }))} />
                </div>
              ))}
            </div>
            <p className={clsx('mt-2 text-right text-[13px]', paySum === total ? 'text-gain' : 'text-ink-2')}>
              {formatMoney(paySum, group.currency)} of {formatMoney(total, group.currency)}
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-[13px] font-semibold">Split</p>
          <Tabs value={mode} onChange={(v) => { setMode(v); setError(null); }}
            tabs={[{ value: 'equal', label: 'Equally' }, { value: 'exact', label: 'Exact amounts' }, { value: 'percent', label: 'Percentages' }]} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {group.members.map((m) => {
              const on = included.includes(m.id);
              if (mode === 'equal') {
                const each = included.length ? Math.floor(total / included.length) : 0;
                return (
                  <button key={m.id} type="button" aria-pressed={on}
                    onClick={() => setIncluded((xs) => (on ? xs.filter((x) => x !== m.id) : [...xs, m.id]))}
                    className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm',
                      on ? 'border-felt bg-felt/10 font-semibold' : 'border-line text-ink-2')}>
                    <Avatar name={m.name} size={24} /><span className="flex-1 truncate">{m.name}</span>
                    <span className="amount text-[13px]">{on ? formatMoney(each, group.currency) : 'not in'}</span>
                  </button>
                );
              }
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-24 truncate text-sm">{m.name}</span>
                  {mode === 'exact' ? (
                    <MoneyInput className="flex-1" value={values[m.id] ?? ''} placeholder="0"
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                  ) : (
                    <div className="relative flex-1">
                      <Input inputMode="decimal" className="amount pr-7 text-right" value={values[m.id] ?? ''} placeholder="0"
                        onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-2">%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {remaining !== null && (
            <p className={clsx('mt-2 text-right text-[13px]', remaining === 0 ? 'text-gain' : 'text-ink-2')}>
              {remaining === 0 ? 'Every cent assigned' : `${formatMoney(Math.abs(remaining), group.currency)} ${remaining > 0 ? 'left to assign' : 'over'}`}
            </p>
          )}
          {mode === 'percent' && (
            <p className={clsx('mt-2 text-right text-[13px]', Math.abs(pctSum - 100) < 0.001 ? 'text-gain' : 'text-ink-2')}>
              {Math.round(pctSum * 100) / 100}% of 100%
            </p>
          )}
        </div>
        {error && <p className="rounded-lg bg-loss/10 px-3 py-2 text-[13px] text-loss">{error}</p>}
      </div>
    </Modal>
  );
}
