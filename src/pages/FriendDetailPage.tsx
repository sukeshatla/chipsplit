import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, HandCoins, Receipt, Trash2, UserX } from 'lucide-react';
import { useData, useAction } from '../app/data';
import { friendsList, isGroupAdmin, memberShort, moneyPhrase, myMemberId, STATUS_LABEL, type FriendGroupBalance } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Amount, Avatar, BackLink, BalanceText, Button, byMonth, Card, CardHeader, DateTile, EmptyState, LIST_STEP, MonthHeader, Row, ShowMore } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { GroupIcon } from './GroupsPage';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import { ExpenseDialog } from '../components/dialogs/ExpenseDialog';
import { ExpenseDetailDialog } from '../components/dialogs/ExpenseDetailDialog';
import { useDirectGroup } from '../components/dialogs/QuickExpenseDialog';
import type { Expense, Group, Settlement } from '../lib/types';

/** Draft for settling one group's balance between you and this friend. */
function settleDraft(fg: FriendGroupBalance): SettleDraft {
  return fg.cents > 0
    ? { from: fg.memberId, to: fg.myMemberId, cents: fg.cents }
    : { from: fg.myMemberId, to: fg.memberId, cents: -fg.cents };
}

export function FriendDetailPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const { run, busy } = useAction();
  const direct = useDirectGroup();
  const [params, setParams] = useSearchParams();
  const f = friendsList(data).find((x) => x.key === decodeURIComponent(key ?? ''));
  const [settle, setSettle] = useState<{ group: Group; draft: SettleDraft } | null>(null);
  const [shown, setShown] = useState(LIST_STEP);
  const [deletingPayment, setDeletingPayment] = useState<{ st: Settlement; g: Group } | null>(null);
  const [editing, setEditing] = useState<{ group: Group; expense: Expense | null } | null>(null);
  if (!f) return <Navigate to="/friends" replace />;

  const directGroups = f.groups.filter((fg) => fg.group.is_direct);
  const sharedGroups = f.groups.filter((fg) => !fg.group.is_direct);
  // Friend-only expenses, newest first, across every direct group this friend is in.
  const directExpenses = directGroups
    .flatMap((fg) => fg.group.expenses.map((e) => ({ e, g: fg.group })))
    .sort((a, b) => b.e.spent_on.localeCompare(a.e.spent_on) || b.e.created_at.localeCompare(a.e.created_at));
  // Expenses and payments together, newest first, for the month-by-month list.
  type Item = { kind: 'expense'; date: string; at: string; e: Expense; g: Group } | { kind: 'payment'; date: string; at: string; st: Settlement; g: Group };
  const timeline: Item[] = [
    ...directExpenses.map(({ e, g }) => ({ kind: 'expense' as const, date: e.spent_on, at: e.created_at, e, g })),
    ...directGroups.flatMap((fg) => fg.group.settlements.map((st) => ({ kind: 'payment' as const, date: st.settled_on, at: st.created_at, st, g: fg.group }))),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  const openId = params.get('expense');
  const openIndex = timeline.findIndex((x) => x.kind === 'expense' && x.e.id === openId);
  if (openIndex >= shown) setShown(openIndex + 1);
  const open = directExpenses.find((x) => x.e.id === openId) ?? null;
  const setOpen = (id: string | null) => setParams(id ? { expense: id } : {}, { replace: true });

  const addExpense = async () => {
    const g = await direct.find([f]);
    if (g) setEditing({ group: g, expense: null });
  };
  const removeFriend = async () => {
    if (!f.contactId) return;
    const ok = await run((api) => api.deleteContact(f.contactId!), `${f.name} removed from your friends`);
    if (ok) navigate('/friends');
  };

  return (
    <>
      <BackLink to="/friends" label="Friends" />
      <section className="mb-4 flex items-center gap-3">
        <Avatar name={f.name} src={f.avatar_url} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[22px] font-medium leading-tight md:text-[28px]">{f.name}</h1>
          <p className="truncate text-[13px] text-ink-2">{STATUS_LABEL[f.status]}{f.email ? ` · ${f.email}` : ''}</p>
        </div>
      </section>

      <section className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-2">{f.net === 0 ? 'All square' : f.net > 0 ? 'Owes you' : 'You owe'}</p>
          <p className={`amount font-display text-2xl font-medium ${f.net > 0 ? 'text-gain' : f.net < 0 ? 'text-loss' : ''}`}>{formatMoney(Math.abs(f.net), f.currency)}</p>
          {f.others.map((m) => <p key={m.currency} className="amount truncate text-[12px] text-ink-2">and {moneyPhrase(m, 'friend')}</p>)}
        </div>
        <Button variant="primary" loading={direct.busy} onClick={addExpense}><Receipt size={16} aria-hidden="true" />Add expense</Button>
      </section>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Just you two" />
          {/* Balance first (the list below can be long), laid out like the group rows. A friend can
              share more than one one-on-one ledger (e.g. one with a third friend), so one row each. */}
          {directGroups.map((fg) => (
            <Row key={fg.group.id} className="border-b border-line">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gain/10 text-gain"><HandCoins size={16} aria-hidden="true" /></span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {fg.group.members.length > 2 ? `With ${fg.group.members.filter((m) => m.user_id !== data.me.id).map((m) => memberShort(fg.group, m.id)).join(', ')}` : 'Balance'}
              </p>
              <BalanceText cents={fg.cents} currency={fg.group.currency} />
              {fg.cents !== 0 && <Button size="sm" onClick={() => setSettle({ group: fg.group, draft: settleDraft(fg) })}>Settle</Button>}
            </Row>
          ))}
          {timeline.length === 0 ? (
            <p className="px-4 pb-4 pt-3 text-sm text-ink-2 md:px-5">Expenses you add here stay between you and {f.name}, outside any group.</p>
          ) : byMonth(timeline.slice(0, shown), (x) => x.date).map(([month, items]) => (
            <div key={month}>
              <MonthHeader month={month} />
              {items.map((x) => {
                if (x.kind === 'payment') {
                  const st = x.st, g = x.g;
                  const toMe = st.to_member === myMemberId(g, data.me.id);
                  return (
                    <Row key={st.id} onClick={() => setDeletingPayment({ st, g })}>
                      <DateTile date={st.settled_on} />
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gain/10 text-gain"><HandCoins size={16} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{memberShort(g, st.from_member)} paid {memberShort(g, st.to_member)}</p>
                        <p className="truncate text-[12px] text-ink-2">{[st.method, st.note].filter(Boolean).join(' · ') || 'Payment'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-ink-2">{toMe ? 'you received' : 'you paid'}</p>
                        <p className="amount font-display text-sm font-medium">{formatMoney(st.amount_cents, g.currency)}</p>
                      </div>
                    </Row>
                  );
                }
                const { e, g } = x;
                const mine = myMemberId(g, data.me.id);
                const impact = (e.payers.find((p) => p.member_id === mine)?.amount_cents ?? 0) - (e.shares.find((s) => s.member_id === mine)?.amount_cents ?? 0);
                return (
                  <Row key={e.id} onClick={() => setOpen(e.id)}>
                    <DateTile date={e.spent_on} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.description}</p>
                      <p className="truncate text-[12px] text-ink-2">{e.payers.map((p) => memberShort(g, p.member_id)).join(' and ')} paid {formatMoney(e.amount_cents, g.currency)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] text-ink-2">{impact > 0 ? 'you lent' : impact < 0 ? 'you borrowed' : 'even'}</p>
                      {impact !== 0 && <Amount cents={impact} currency={g.currency} className="text-sm" />}
                    </div>
                  </Row>
                );
              })}
            </div>
          ))}
          <ShowMore shown={shown} total={timeline.length} onMore={() => setShown((n) => n + LIST_STEP)} onAll={() => setShown(timeline.length)} />
        </Card>

        <Card>
          <CardHeader title="In groups" />
          {sharedGroups.length === 0 ? (
            <EmptyState icon={<HandCoins size={28} />} title="No shared group yet" body="Add them to a group and those balances show up here." />
          ) : (
            <div className="mt-2">
              {sharedGroups.map((fg) => (
                <Row key={fg.group.id}>
                  <GroupIcon kind={fg.group.kind} size={32} />
                  <Link to={`/groups/${fg.group.id}?tab=balances`} className="flex min-w-0 flex-1 items-center gap-1 text-sm font-semibold">
                    <span className="truncate">{fg.group.name}</span><ChevronRight size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
                  </Link>
                  <BalanceText cents={fg.cents} currency={fg.group.currency} />
                  {fg.cents !== 0 && <Button size="sm" onClick={() => setSettle({ group: fg.group, draft: settleDraft(fg) })}>Settle</Button>}
                </Row>
              ))}
            </div>
          )}
        </Card>
      </div>

      {f.contactId && f.groups.length === 0 && (
        <Button variant="danger" className="mt-4" loading={busy} onClick={removeFriend}><UserX size={16} aria-hidden="true" />Remove friend</Button>
      )}
      <ConfirmDialog open={!!deletingPayment} onClose={() => setDeletingPayment(null)} title="Delete this payment?" icon={Trash2} busy={busy}
        body={deletingPayment && <>This removes the record of <b>{memberShort(deletingPayment.g, deletingPayment.st.from_member)}</b> paying <b>{memberShort(deletingPayment.g, deletingPayment.st.to_member)}</b> <b>{formatMoney(deletingPayment.st.amount_cents, deletingPayment.g.currency)}</b>. The balance goes back to what it was before.</>}
        onConfirm={async () => { const id = deletingPayment!.st.id; setDeletingPayment(null); await run((api) => api.deleteSettlement(id), 'Payment deleted'); }} />
      {settle && <SettleDialog group={settle.group} draft={settle.draft} onClose={() => setSettle(null)} />}
      {open && <ExpenseDetailDialog group={open.g} expense={open.e} onClose={() => setOpen(null)}
        onEdit={(e) => { setOpen(null); setEditing({ group: open.g, expense: e }); }} />}
      {editing && isGroupAdmin(editing.group, data.me.id) && (
        <ExpenseDialog group={editing.group} expense={editing.expense} open onClose={() => setEditing(null)} />
      )}
    </>
  );
}
