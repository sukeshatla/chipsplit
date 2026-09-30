import { useEffect, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Check, Minus, Plus, UserPlus } from 'lucide-react';
import { Button, Field, IconButton, Input, Modal, MoneyInput, Select, Tabs, Avatar } from '../ui';
import { useAction, useData } from '../../app/data';
import { centsToInput, equalPercents, formatMoney, parseMoney, splitByWeights, splitEqual, todayISO } from '../../lib/money';
import { myMemberId } from '../../lib/ledger';
import { AddMemberDialog } from './AddMemberDialog';
import type { Expense, Group, Split } from '../../lib/types';

export const CATEGORIES = ['general', 'food', 'drinks', 'lodging', 'transport', 'housing', 'utilities', 'household', 'fun', 'cards'];
type SplitMode = 'equal' | 'shares' | 'exact' | 'percent';

/** One row in the "who's in this split" list: a checkable toggle, plus the mode's own control when included. */
function SplitRow({ name, on, toggle, children }: { name: string; on: boolean; toggle(): void; children?: ReactNode }) {
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', on ? 'border-felt bg-felt/10' : 'border-line')}>
      <button type="button" aria-pressed={on} onClick={toggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Avatar name={name} size={24} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        {on && <Check size={15} className="shrink-0 text-felt dark:text-gain" aria-hidden="true" />}
      </button>
      {on ? children : <span className="shrink-0 text-[13px] text-ink-2">not in</span>}
    </div>
  );
}

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
  const [addingPerson, setAddingPerson] = useState(false);

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
  const exactSum = included.reduce((a, id) => a + (parseMoney(values[id]) ?? 0), 0);
  const pctSum = included.reduce((a, id) => a + (Number(values[id]) || 0), 0);
  const paySum = group.members.reduce((a, m) => a + (parseMoney(payAmounts[m.id]) ?? 0), 0);

  function buildShares(): Split[] | string {
    if (included.length === 0) return 'Pick at least one person to split with';
    if (mode === 'equal') return splitEqual(total, included);
    if (mode === 'shares') return splitByWeights(total, included.map((id) => ({ id, weight: Number(values[id]) || 1 })));
    if (mode === 'exact') {
      if (exactSum !== total) return `Shares add up to ${formatMoney(exactSum, group.currency)}, not ${formatMoney(total, group.currency)}`;
      return included.map((id) => ({ member_id: id, amount_cents: parseMoney(values[id]) ?? 0 })).filter((s) => s.amount_cents > 0);
    }
    if (Math.abs(pctSum - 100) > 0.001) return `Percentages add up to ${Math.round(pctSum * 100) / 100}%, not 100%`;
    return splitByWeights(total, included.map((id) => ({ id, weight: Number(values[id]) || 0 })));
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
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Split</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAddingPerson(true)}>
              <UserPlus size={14} aria-hidden="true" />Add someone
            </Button>
          </div>
          <Tabs value={mode} onChange={(v) => {
            setMode(v); setError(null);
            if (v === 'percent') {
              const pcts = equalPercents(included.length);
              setValues((old) => { const next = { ...old }; included.forEach((id, i) => { next[id] = pcts[i] ?? '0'; }); return next; });
            }
          }} tabs={[{ value: 'equal', label: 'Equally' }, { value: 'shares', label: 'Shares' }, { value: 'exact', label: 'Exact amounts' }, { value: 'percent', label: 'Percentages' }]} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {group.members.map((m) => {
              const on = included.includes(m.id);
              const toggle = () => setIncluded((xs) => (on ? xs.filter((x) => x !== m.id) : [...xs, m.id]));

              if (mode === 'equal') {
                const each = included.length ? Math.floor(total / included.length) : 0;
                return <SplitRow key={m.id} name={m.name} on={on} toggle={toggle}>
                  <span className="amount shrink-0 text-[13px] text-ink-2">{formatMoney(each, group.currency)}</span>
                </SplitRow>;
              }
              if (mode === 'shares') {
                const shares = included.map((id) => ({ id, weight: Number(values[id]) || 1 }));
                const mine = shares.find((x) => x.id === m.id);
                const totalShares = shares.reduce((a, x) => a + x.weight, 0);
                const amount = on && totalShares ? Math.floor((total * (mine?.weight ?? 1)) / totalShares) : 0;
                const setShares = (n: number) => setValues((v) => ({ ...v, [m.id]: String(Math.max(1, n)) }));
                return <SplitRow key={m.id} name={m.name} on={on} toggle={toggle}>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton label={`Fewer shares for ${m.name}`} onClick={() => setShares((mine?.weight ?? 1) - 1)}><Minus size={14} /></IconButton>
                    <span className="amount w-4 text-center text-sm">{mine?.weight ?? 1}</span>
                    <IconButton label={`More shares for ${m.name}`} onClick={() => setShares((mine?.weight ?? 1) + 1)}><Plus size={14} /></IconButton>
                    <span className="amount w-16 text-right text-[13px] text-ink-2">{formatMoney(amount, group.currency)}</span>
                  </div>
                </SplitRow>;
              }
              if (mode === 'exact') {
                return <SplitRow key={m.id} name={m.name} on={on} toggle={toggle}>
                  <MoneyInput className="w-28 shrink-0" value={values[m.id] ?? ''} placeholder="0"
                    onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                </SplitRow>;
              }
              return <SplitRow key={m.id} name={m.name} on={on} toggle={toggle}>
                <div className="relative w-20 shrink-0">
                  <Input inputMode="decimal" className="amount pr-6 text-right" value={values[m.id] ?? ''} placeholder="0"
                    onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">%</span>
                </div>
              </SplitRow>;
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
      <AddMemberDialog group={group} open={addingPerson} onClose={() => setAddingPerson(false)}
        onAdded={(id) => setIncluded((xs) => [...xs, id])} />
    </Modal>
  );
}
