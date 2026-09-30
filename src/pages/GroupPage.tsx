import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Spade, Receipt, Upload, HandCoins, Trash2, Trophy, UserPlus, ArrowRight, ChevronRight, Mail, MailX, Send } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { groupBalances, memberHasActivity, memberName, myMemberId, pokerLeaderboard, sessionPayments, simplify, summaryMailto } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, PageHeader, Row, Select, Tabs } from '../components/ui';
import { HistoryList } from '../components/HistoryList';
import { KIND_LABEL } from './GroupsPage';
import { ExpenseDialog } from '../components/dialogs/ExpenseDialog';
import { ImportDialog } from '../components/dialogs/ImportDialog';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import { NewGameDialog } from '../components/dialogs/NewGameDialog';
import { AddMemberDialog } from '../components/dialogs/AddMemberDialog';
import { CURRENCIES, KindPicker } from '../components/dialogs/CreateGroupDialog';
import type { Expense, Group, GroupKind } from '../lib/types';

type Tab = 'games' | 'balances' | 'expenses' | 'members' | 'history';

export function GroupPage() {
  const { groupId } = useParams();
  const { me, groups } = useData();
  const g = groups.find((x) => x.id === groupId);
  const [params, setParams] = useSearchParams();
  const [newGame, setNewGame] = useState(false);
  const [expense, setExpense] = useState<Expense | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settle, setSettle] = useState<SettleDraft | null>(null);

  if (!g) return <Navigate to="/groups" replace />;

  const tabs: { value: Tab; label: string }[] = [
    ...(g.kind !== 'expenses' ? [{ value: 'games' as Tab, label: 'Game days' }] : []),
    { value: 'balances', label: 'Balances' },
    ...(g.kind !== 'poker' || g.expenses.length ? [{ value: 'expenses' as Tab, label: 'Expenses' }] : []),
    { value: 'members', label: 'Members' },
    { value: 'history', label: 'History' },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : tabs[0]!.value;
  const mine = myMemberId(g, me.id);
  const myBal = mine ? groupBalances(g).get(mine) ?? 0 : 0;

  return (
    <>
      <PageHeader
        back={<Link to="/groups" className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={14} aria-hidden="true" />Groups</Link>}
        title={g.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={g.kind === 'poker' ? 'felt' : 'neutral'}>{KIND_LABEL[g.kind]}</Badge>
          <span>{g.members.length} people</span>
          <span>{myBal === 0 ? 'You are settled up' : <>You {myBal > 0 ? 'are owed' : 'owe'} <Amount cents={myBal} currency={g.currency} className="text-sm" /></>}</span>
        </span>}
        actions={<>
          <Button onClick={() => { window.location.href = summaryMailto(g); }}><Send size={16} aria-hidden="true" />Send summary</Button>
          {g.kind !== 'poker' && <Button onClick={() => setImportOpen(true)}><Upload size={16} aria-hidden="true" />Import</Button>}
          {g.kind !== 'expenses' && <Button variant={g.kind === 'poker' ? 'primary' : 'secondary'} onClick={() => setNewGame(true)}><Spade size={16} aria-hidden="true" />Game day</Button>}
          <Button variant={g.kind === 'poker' ? 'secondary' : 'primary'} onClick={() => setExpense('new')}><Receipt size={16} aria-hidden="true" />Expense</Button>
        </>}
      />
      <div className="mb-5"><Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} /></div>

      {tab === 'games' && <GamesTab g={g} onNew={() => setNewGame(true)} />}
      {tab === 'balances' && <BalancesTab g={g} onSettle={setSettle} onAddExpense={() => setExpense('new')} />}
      {tab === 'expenses' && <ExpensesTab g={g} meMember={mine} onEdit={setExpense} onImport={() => setImportOpen(true)} />}
      {tab === 'members' && <MembersTab g={g} />}
      {tab === 'history' && <HistoryList g={g} />}

      <NewGameDialog open={newGame} onClose={() => setNewGame(false)} groupId={g.id} />
      <ExpenseDialog group={g} open={expense !== null} expense={expense === 'new' ? null : expense} onClose={() => setExpense(null)} />
      <ImportDialog group={g} open={importOpen} onClose={() => setImportOpen(false)} />
      <SettleDialog group={g} draft={settle} onClose={() => setSettle(null)} />
    </>
  );
}

function GamesTab({ g, onNew }: { g: Group; onNew(): void }) {
  const board = pokerLeaderboard(g);
  const sessions = g.sessions.slice().sort((a, b) => b.played_on.localeCompare(a.played_on));
  if (sessions.length === 0) {
    return <Card><EmptyState icon={<Spade size={28} />} title="Deal the first game" body="Start a game day, log buy-ins as people join, and cash-outs when the table breaks."
      action={<Button variant="primary" onClick={onNew}>Start game</Button>} /></Card>;
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Trophy size={16} className="text-brass" aria-hidden="true" />Leaderboard</span>} />
        <div className="mt-2">
          {board.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-2">Finish a game day to start the leaderboard.</p> :
            board.map((r, i) => (
              <Row key={r.memberId}>
                <span className="amount w-5 text-center font-display text-sm text-ink-2">{i + 1}</span>
                <Avatar name={r.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="text-[12px] text-ink-2">{r.games} games, won {r.wins}, best {formatMoney(r.best, g.currency)}</p>
                </div>
                <Amount cents={r.net} currency={g.currency} sign className="text-base" />
              </Row>
            ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Game days" action={<Button size="sm" onClick={onNew}><Plus size={14} aria-hidden="true" />New</Button>} />
        <div className="mt-2">
          {sessions.map((s) => {
            const pays = s.status === 'final' ? sessionPayments(g, s) : [];
            const unpaid = pays.filter((p) => !p.settlementId).length;
            const pot = s.results.reduce((a, r) => a + r.buy_in_cents, 0);
            return (
              <Link key={s.id} to={`/groups/${g.id}/games/${s.id}`} className="block">
                <Row className="hover:bg-surface-2/60">
                  <div className="w-11 shrink-0 text-center">
                    <p className="text-[11px] font-semibold text-ink-2">{formatDate(s.played_on, { month: 'short' })}</p>
                    <p className="font-display text-xl font-medium leading-none">{formatDate(s.played_on, { day: 'numeric' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.location ?? 'Game day'}</p>
                    <p className="text-[12px] text-ink-2">{s.results.length} players, {formatMoney(pot, g.currency)} in play</p>
                  </div>
                  {s.status === 'open' ? <Badge tone="brass">In progress</Badge>
                    : unpaid > 0 ? <Badge tone="loss">{unpaid} unpaid</Badge> : <Badge tone="gain">Settled</Badge>}
                  <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
                </Row>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function BalancesTab({ g, onSettle, onAddExpense }: { g: Group; onSettle(d: SettleDraft): void; onAddExpense(): void }) {
  const { run } = useAction();
  const bal = groupBalances(g);
  const transfers = simplify(bal);
  const history = g.settlements.slice().sort((a, b) => b.settled_on.localeCompare(a.settled_on) || b.created_at.localeCompare(a.created_at));
  const members = g.members.slice().sort((a, b) => (bal.get(b.id) ?? 0) - (bal.get(a.id) ?? 0));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Settle up" action={<Button size="sm" onClick={onAddExpense}><Receipt size={14} aria-hidden="true" />Add expense</Button>} />
          <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">The fewest payments that square everyone in this group.</p>
          <div className="mt-2">
            {transfers.length === 0 ? <p className="px-5 pb-5 pt-2 text-sm text-ink-2">Everyone is settled up.</p> :
              transfers.map((t) => (
                <Row key={`${t.from}-${t.to}`}>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <b className="font-semibold">{memberName(g, t.from)}</b>
                    <ArrowRight size={14} className="mx-1.5 inline text-ink-2" aria-label="pays" />
                    <b className="font-semibold">{memberName(g, t.to)}</b>
                  </span>
                  <span className="amount font-display font-medium">{formatMoney(t.cents, g.currency)}</span>
                  <Button size="sm" onClick={() => onSettle({ from: t.from, to: t.to, cents: t.cents })}>Record</Button>
                </Row>
              ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Where everyone stands" />
          <div className="mt-2">
            {members.map((m) => (
              <Row key={m.id}>
                <Avatar name={m.name} size={32} />
                <span className="flex-1 truncate text-sm font-semibold">{m.name}</span>
                <Amount cents={bal.get(m.id) ?? 0} currency={g.currency} sign />
              </Row>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Payments recorded" />
        <div className="mt-2">
          {history.length === 0 ? <p className="px-5 pb-5 pt-2 text-sm text-ink-2">Payments you record show up here.</p> :
            history.map((s) => (
              <Row key={s.id}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gain/10 text-gain"><HandCoins size={16} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{memberName(g, s.from_member)} paid {memberName(g, s.to_member)}</p>
                  <p className="truncate text-[12px] text-ink-2">{formatDate(s.settled_on)}{s.method ? `, ${s.method}` : ''}{s.session_id ? ', game day' : ''}{s.note ? `, ${s.note}` : ''}</p>
                </div>
                <span className="amount font-display font-medium">{formatMoney(s.amount_cents, g.currency)}</span>
                <IconButton label="Delete payment" onClick={() => { if (confirm('Delete this payment?')) run((api) => api.deleteSettlement(s.id), 'Payment deleted'); }}>
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            ))}
        </div>
      </Card>
    </div>
  );
}

function ExpensesTab({ g, meMember, onEdit, onImport }: { g: Group; meMember?: string; onEdit(e: Expense | 'new'): void; onImport(): void }) {
  const { run } = useAction();
  const list = g.expenses.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  if (list.length === 0) {
    return <Card><EmptyState icon={<Receipt size={28} />} title="Log the first expense" body="Add costs as they happen, or bring in a spreadsheet you already keep."
      action={<div className="flex gap-2"><Button onClick={onImport}>Import sheet</Button><Button variant="primary" onClick={() => onEdit('new')}>Add expense</Button></div>} /></Card>;
  }
  const byMonth = new Map<string, Expense[]>();
  list.forEach((e) => { const k = e.spent_on.slice(0, 7); byMonth.set(k, [...(byMonth.get(k) ?? []), e]); });
  const total = list.reduce((a, e) => a + e.amount_cents, 0);

  return (
    <Card>
      <CardHeader title={`${list.length} expenses`} action={<span className="amount text-sm text-ink-2">{formatMoney(total, g.currency)} total</span>} />
      <div className="mt-2">
        {[...byMonth].map(([month, items]) => (
          <div key={month}>
            <p className="bg-surface-2/60 px-4 py-1.5 text-[12px] font-semibold text-ink-2 md:px-5">{formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}</p>
            {items.map((e) => {
              const paid = e.payers.find((p) => p.member_id === meMember)?.amount_cents ?? 0;
              const share = e.shares.find((s) => s.member_id === meMember)?.amount_cents ?? 0;
              const impact = paid - share;
              return (
                <Row key={e.id}>
                  <button onClick={() => onEdit(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="w-9 shrink-0 text-center">
                      <p className="font-display text-lg font-medium leading-none">{formatDate(e.spent_on, { day: 'numeric' })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.description}</p>
                      <p className="truncate text-[12px] text-ink-2">
                        {e.payers.map((p) => memberName(g, p.member_id)).join(' and ')} paid {formatMoney(e.amount_cents, g.currency)}, split {e.shares.length} ways
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-ink-2">{impact > 0 ? 'you lent' : impact < 0 ? 'you borrowed' : paid || share ? 'even' : 'not involved'}</p>
                      {impact !== 0 && <Amount cents={Math.abs(impact) * Math.sign(impact)} currency={g.currency} className="text-sm" />}
                    </div>
                  </button>
                  <IconButton label={`Delete ${e.description}`} onClick={() => { if (confirm(`Delete "${e.description}"?`)) run((api) => api.deleteExpense(e.id), 'Expense deleted'); }}>
                    <Trash2 size={16} />
                  </IconButton>
                </Row>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MembersTab({ g }: { g: Group }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(g.name);
  const [kind, setKind] = useState<GroupKind>(g.kind);
  const [currency, setCurrency] = useState(g.currency);
  const iAmOwner = g.members.some((m) => m.user_id === me.id && m.role === 'owner');
  const dirty = name.trim() !== g.name || kind !== g.kind || currency !== g.currency;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Members" action={<Button size="sm" onClick={() => setAdding(true)}><UserPlus size={14} aria-hidden="true" />Add</Button>} />
        <div className="mt-2">
          {g.members.map((m) => {
            const active = memberHasActivity(g, m.id);
            return (
              <Row key={m.id}>
                <Avatar name={m.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}{m.user_id === me.id && <span className="font-normal text-ink-2"> (you)</span>}</p>
                  <p className="truncate text-[12px] text-ink-2">{m.email ?? 'No email'}</p>
                </div>
                {m.role === 'owner' ? <Badge tone="brass">Owner</Badge> : m.user_id ? <Badge tone="gain">Signed up</Badge> : <Badge>Guest</Badge>}
                {m.email && (
                  <IconButton label={m.email_opt_out ? `Include ${m.name} in email summaries` : `Exclude ${m.name} from email summaries`}
                    title={m.email_opt_out ? 'Not included in email summaries' : 'Included in email summaries'}
                    onClick={() => run((api) => api.setEmailOptOut(m.id, !m.email_opt_out))}>
                    {m.email_opt_out ? <MailX size={16} className="text-ink-2" /> : <Mail size={16} />}
                  </IconButton>
                )}
                <IconButton label={`Remove ${m.name}`} disabled={active || m.user_id === me.id}
                  title={active ? 'Has games, expenses, or payments in this group' : `Remove ${m.name}`}
                  onClick={() => { if (confirm(`Remove ${m.name} from ${g.name}?`)) run((api) => api.removeMember(m.id), `${m.name} removed`); }}>
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            );
          })}
        </div>
        <p className="px-4 pb-4 pt-3 text-[12px] text-ink-2 md:px-5">People with history in the group can't be removed, so balances stay correct.</p>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="mb-4 font-display text-base font-medium">Group settings</h2>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div><span className="mb-1.5 block text-[13px] font-semibold">What's it for</span><KindPicker value={kind} onChange={setKind} /></div>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            {iAmOwner ? (
              <Button variant="danger" onClick={async () => {
                if (!confirm(`Delete ${g.name} and all its games, expenses, and payments? This can't be undone.`)) return;
                const ok = await run((api) => api.deleteGroup(g.id), 'Group deleted');
                if (ok !== undefined) nav('/groups');
              }}><Trash2 size={16} aria-hidden="true" />Delete group</Button>
            ) : <span />}
            <Button variant="primary" disabled={!dirty || !name.trim()} loading={busy}
              onClick={() => run((api) => api.updateGroup(g.id, { name: name.trim(), kind, currency }), 'Group saved')}>Save changes</Button>
          </div>
        </div>
      </Card>
      <AddMemberDialog group={g} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
