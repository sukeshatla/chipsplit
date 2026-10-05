import { useEffect, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { CalendarDays, Check, Minus, Plus, SlidersHorizontal, UserPlus } from 'lucide-react';
import { Button, Field, IconButton, Input, Modal, MoneyInput, Select, Tabs, Avatar, enterToNext } from '../ui';
import { useAction, useData } from '../../app/data';
import { centsToInput, equalPercents, formatDate, formatMoney, parseMoney, splitByWeights, splitEqual, todayISO } from '../../lib/money';
import { friendKey, memberShort, myMemberId } from '../../lib/ledger';
import { AddMemberDialog } from './AddMemberDialog';
import type { Expense, Group, Split } from '../../lib/types';

type SplitMode = 'equal' | 'shares' | 'exact' | 'percent';
/** Two-person shortcuts, Splitwise-style: who paid, and whether it's halved or all on the other. */
type Quick = 'meEqual' | 'meAll' | 'themEqual' | 'themAll';

/** A label and a two-choice pill switch on one line. */
function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange(v: string): void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[13px] text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex min-w-0 flex-1 rounded-lg border border-line p-0.5">
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={clsx('h-8 min-w-0 flex-1 truncate rounded-md px-2 text-[13px] font-semibold', value === v ? 'bg-felt text-felt-ink' : 'text-ink-2 hover:text-ink')}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One row in the "who's in this split" list: a checkable toggle, plus the mode's own control when included. */
function SplitRow({ name, avatarUrl, on, toggle, children }: { name: string; avatarUrl?: string | null; on: boolean; toggle(): void; children?: ReactNode }) {
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', on ? 'border-felt bg-felt/10' : 'border-line')}>
      <button type="button" aria-pressed={on} onClick={toggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Avatar name={name} src={avatarUrl} size={24} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        {on && <Check size={15} className="shrink-0 text-felt dark:text-gain" aria-hidden="true" />}
      </button>
      {on ? children : <span className="shrink-0 text-[13px] text-ink-2">not in</span>}
    </div>
  );
}

/** One-on-one expenses can be in any of these; each currency keeps its own balance with that friend. */
export const EXPENSE_CURRENCIES = ['USD', 'INR', 'GBP'];

/**
 * `onPickCurrency` (new one-on-one expenses only) offers USD / INR / GBP under More options.
 * A direct group has one currency, so saving in another one goes to the direct group for the
 * same people in that currency (found or created by the caller), with everyone mapped across.
 */
export function ExpenseDialog({ group, expense, open, onClose, onPickCurrency }: {
  group: Group; expense: Expense | null; open: boolean; onClose(): void; onPickCurrency?: (currency: string) => Promise<Group | null>;
}) {
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
  // The full editor (several payers, shares/exact/percent, who's in) stays behind "More options";
  // most expenses are one payer splitting equally, or one person covering the other entirely.
  const [advanced, setAdvanced] = useState(false);
  const [quick, setQuick] = useState<Quick>('meEqual');
  const [editingDate, setEditingDate] = useState(false);
  const [currency, setCurrency] = useState(group.currency);
  const cur = onPickCurrency ? currency : group.currency;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!expense) {
      setDescription(''); setAmount(''); setDate(todayISO()); setCategory('general');
      setMultiPay(false); setPayer(mine); setPayAmounts({});
      setMode('equal'); setIncluded(group.members.map((m) => m.id)); setValues({});
      setAdvanced(false); setQuick('meEqual'); setEditingDate(false); setCurrency(group.currency);
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
    setEditingDate(false);
    // Reopen in the simple view only if the expense is one of its shapes; otherwise the full editor.
    const shape = quickShape(expense);
    setAdvanced(shape === null);
    if (shape && shape !== 'equalAll') setQuick(shape);
    // Initialize only when the dialog opens, so a background refresh can't wipe a half-filled form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const total = parseMoney(amount) ?? 0;
  const exactSum = included.reduce((a, id) => a + (parseMoney(values[id]) ?? 0), 0);
  const pctSum = included.reduce((a, id) => a + (Number(values[id]) || 0), 0);
  const paySum = group.members.reduce((a, m) => a + (parseMoney(payAmounts[m.id]) ?? 0), 0);

  const twoPeople = group.members.length === 2;
  const other = group.members.find((m) => m.id !== mine)?.id ?? '';
  const isMe = (id: string) => group.members.find((m) => m.id === id)?.user_id === me.id;
  const label = (id: string) => (isMe(id) ? 'You' : memberShort(group, id));

  /** Which simple view an existing expense fits, if any. */
  function quickShape(e: Expense): Quick | 'equalAll' | null {
    if (e.payers.length !== 1) return null;
    const paidByMe = e.payers[0]!.member_id === mine;
    const amts = e.shares.map((s) => s.amount_cents);
    const equal = amts.length > 0 && Math.max(...amts) - Math.min(...amts) <= 1;
    if (twoPeople) {
      if (e.shares.length === 2 && equal) return paidByMe ? 'meEqual' : 'themEqual';
      if (e.shares.length === 1 && e.shares[0]!.member_id !== e.payers[0]!.member_id) return paidByMe ? 'meAll' : 'themAll';
      return null;
    }
    return equal && e.shares.length === group.members.length ? 'equalAll' : null;
  }

  function quickSplit(): { payers: Split[]; shares: Split[] } {
    if (twoPeople) {
      const by = quick.startsWith('me') ? mine : other;
      const owes = by === mine ? other : mine;
      return {
        payers: [{ member_id: by, amount_cents: total }],
        shares: quick.endsWith('Equal') ? splitEqual(total, [mine, other]) : [{ member_id: owes, amount_cents: total }],
      };
    }
    return { payers: [{ member_id: payer, amount_cents: total }], shares: splitEqual(total, group.members.map((m) => m.id)) };
  }

  function buildShares(): Split[] | string {
    if (included.length === 0) return 'Pick at least one person to split with';
    if (mode === 'equal') return splitEqual(total, included);
    if (mode === 'shares') return splitByWeights(total, included.map((id) => ({ id, weight: Number(values[id]) || 1 })));
    if (mode === 'exact') {
      if (exactSum !== total) return `Shares add up to ${formatMoney(exactSum, cur)}, not ${formatMoney(total, cur)}`;
      return included.map((id) => ({ member_id: id, amount_cents: parseMoney(values[id]) ?? 0 })).filter((s) => s.amount_cents > 0);
    }
    if (Math.abs(pctSum - 100) > 0.001) return `Percentages add up to ${Math.round(pctSum * 100) / 100}%, not 100%`;
    return splitByWeights(total, included.map((id) => ({ id, weight: Number(values[id]) || 0 })));
  }

  function buildPayers(): Split[] | string {
    if (!multiPay) return [{ member_id: payer, amount_cents: total }];
    if (paySum !== total) return `Payments add up to ${formatMoney(paySum, cur)}, not ${formatMoney(total, cur)}`;
    return group.members.map((m) => ({ member_id: m.id, amount_cents: parseMoney(payAmounts[m.id]) ?? 0 })).filter((p) => p.amount_cents > 0);
  }

  const submit = async () => {
    if (!description.trim()) { setError('Add a description'); return; }
    if (total <= 0) { setError('Enter an amount'); return; }
    const q = advanced ? null : quickSplit();
    const payers = q ? q.payers : buildPayers();
    if (typeof payers === 'string') { setError(payers); setAdvanced(true); return; }
    const shares = q ? q.shares : buildShares();
    if (typeof shares === 'string') { setError(shares); setAdvanced(true); return; }
    // Another currency lives in the direct group for the same people in that currency.
    let target = group;
    let ps = payers, ss = shares;
    if (onPickCurrency && currency !== group.currency) {
      const g = await onPickCurrency(currency);
      if (!g) { setError(`Couldn't set up ${currency} for these people. Try again.`); return; }
      const byKey = new Map(g.members.map((m) => [friendKey(m), m.id]));
      const across = (id: string) => { const m = group.members.find((x) => x.id === id); return (m && byKey.get(friendKey(m))) ?? id; };
      target = g;
      ps = payers.map((p) => ({ ...p, member_id: across(p.member_id) }));
      ss = shares.map((x) => ({ ...x, member_id: across(x.member_id) }));
    }
    const ok = await run((api) => api.saveExpense({
      group_id: target.id, description: description.trim(), category, amount_cents: total, spent_on: date, payers: ps, shares: ss,
    }, expense?.id), expense ? 'Expense updated' : 'Expense added');
    if (ok !== undefined) onClose();
  };

  const remaining = mode === 'exact' ? total - exactSum : null;

  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Edit expense' : 'Add an expense'} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{expense ? 'Save changes' : 'Add expense'}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_7.5rem] gap-2.5 sm:grid-cols-[1fr_11rem]">
          <Field label="What was it for?">
            <Input value={description} placeholder="Pizza and drinks" enterKeyHint="next" onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Amount"><MoneyInput currency={cur} value={amount} placeholder="0.00" enterKeyHint="done" onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        {editingDate ? (
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        ) : (
          <button type="button" className="-mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => setEditingDate(true)}>
            <CalendarDays size={13} aria-hidden="true" />{date === todayISO() ? 'Today' : formatDate(date)} · Change date
          </button>
        )}

        {!advanced ? (
          twoPeople ? (
            // Two short toggles instead of four big options: who paid, and halved or all on the other.
            <div className="space-y-2">
              <Seg label="Paid by" value={quick.startsWith('me') ? 'me' : 'them'}
                options={[['me', label(mine)], ['them', label(other)]]}
                onChange={(v) => setQuick(`${v}${quick.endsWith('Equal') ? 'Equal' : 'All'}` as Quick)} />
              <Seg label="Split" value={quick.endsWith('Equal') ? 'Equal' : 'All'}
                options={[['Equal', 'Equally'], ['All', `${quick.startsWith('me') ? label(other) : label(mine)} ${(quick.startsWith('me') ? isMe(other) : isMe(mine)) ? 'owe' : 'owes'} all`]]}
                onChange={(v) => setQuick(`${quick.startsWith('me') ? 'me' : 'them'}${v}` as Quick)} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <span className="text-ink-2">Paid by</span>
              <Select aria-label="Paid by" className="h-9 w-auto max-w-[11rem]" value={payer} onChange={(e) => setPayer(e.target.value)}>
                {group.members.map((m) => <option key={m.id} value={m.id}>{isMe(m.id) ? 'You' : m.name}</option>)}
              </Select>
              <span className="text-ink-2">split equally among all {group.members.length}</span>
            </div>
          )
        ) : (<>
          {onPickCurrency && (
            <Field label="Currency">
              <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-lg border border-line p-0.5">
                {EXPENSE_CURRENCIES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)}
                    className={clsx('h-8 rounded-md px-3.5 text-[13px] font-semibold', currency === c ? 'bg-felt text-felt-ink' : 'text-ink-2 hover:text-ink')}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Paid by">
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

        {multiPay && (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[13px] font-semibold">How much each person paid</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-24 truncate text-sm">{m.name}</span>
                  <MoneyInput currency={cur} className="flex-1" value={payAmounts[m.id] ?? ''} placeholder="0" data-entry="paid" enterKeyHint="next" onKeyDown={enterToNext}
                    onChange={(e) => setPayAmounts((p) => ({ ...p, [m.id]: e.target.value }))} />
                </div>
              ))}
            </div>
            <p className={clsx('mt-2 text-right text-[13px]', paySum === total ? 'text-gain' : 'text-ink-2')}>
              {formatMoney(paySum, cur)} of {formatMoney(total, cur)}
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
                return <SplitRow key={m.id} name={m.name} avatarUrl={m.avatar_url} on={on} toggle={toggle}>
                  <span className="amount shrink-0 text-[13px] text-ink-2">{formatMoney(each, cur)}</span>
                </SplitRow>;
              }
              if (mode === 'shares') {
                const shares = included.map((id) => ({ id, weight: Number(values[id]) || 1 }));
                const mine = shares.find((x) => x.id === m.id);
                const totalShares = shares.reduce((a, x) => a + x.weight, 0);
                const amount = on && totalShares ? Math.floor((total * (mine?.weight ?? 1)) / totalShares) : 0;
                const setShares = (n: number) => setValues((v) => ({ ...v, [m.id]: String(Math.max(1, n)) }));
                return <SplitRow key={m.id} name={m.name} avatarUrl={m.avatar_url} on={on} toggle={toggle}>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton label={`Fewer shares for ${m.name}`} onClick={() => setShares((mine?.weight ?? 1) - 1)}><Minus size={14} /></IconButton>
                    <span className="amount w-4 text-center text-sm">{mine?.weight ?? 1}</span>
                    <IconButton label={`More shares for ${m.name}`} onClick={() => setShares((mine?.weight ?? 1) + 1)}><Plus size={14} /></IconButton>
                    <span className="amount w-16 text-right text-[13px] text-ink-2">{formatMoney(amount, cur)}</span>
                  </div>
                </SplitRow>;
              }
              if (mode === 'exact') {
                return <SplitRow key={m.id} name={m.name} avatarUrl={m.avatar_url} on={on} toggle={toggle}>
                  <MoneyInput currency={cur} className="w-28 shrink-0" value={values[m.id] ?? ''} placeholder="0" data-entry="split" enterKeyHint="next" onKeyDown={enterToNext}
                    onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                </SplitRow>;
              }
              return <SplitRow key={m.id} name={m.name} avatarUrl={m.avatar_url} on={on} toggle={toggle}>
                <div className="relative w-20 shrink-0">
                  <Input inputMode="decimal" className="amount pr-6 text-right" value={values[m.id] ?? ''} placeholder="0" data-entry="split" enterKeyHint="next" onKeyDown={enterToNext}
                    onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">%</span>
                </div>
              </SplitRow>;
            })}
          </div>
          {remaining !== null && (
            <p className={clsx('mt-2 text-right text-[13px]', remaining === 0 ? 'text-gain' : 'text-ink-2')}>
              {remaining === 0 ? 'Every cent assigned' : `${formatMoney(Math.abs(remaining), cur)} ${remaining > 0 ? 'left to assign' : 'over'}`}
            </p>
          )}
          {mode === 'percent' && (
            <p className={clsx('mt-2 text-right text-[13px]', Math.abs(pctSum - 100) < 0.001 ? 'text-gain' : 'text-ink-2')}>
              {Math.round(pctSum * 100) / 100}% of 100%
            </p>
          )}
        </div>
        </>)}
        {!advanced && (
          <button type="button" className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => {
            // Carry the simple choice into the full editor so nothing jumps.
            if (twoPeople) { setPayer(quick.startsWith('me') ? mine : other); setIncluded(quick.endsWith('Equal') ? [mine, other] : [quick.startsWith('me') ? other : mine]); }
            setMode('equal'); setAdvanced(true);
          }}>
            <SlidersHorizontal size={13} aria-hidden="true" />More options
          </button>
        )}
        {error && <p className="rounded-lg bg-loss/10 px-3 py-2 text-[13px] text-loss">{error}</p>}
      </div>
      <AddMemberDialog group={group} open={addingPerson} onClose={() => setAddingPerson(false)}
        onAdded={(id) => setIncluded((xs) => [...xs, id])} />
    </Modal>
  );
}
