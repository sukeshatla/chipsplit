import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Spade, Receipt, Upload, HandCoins, Trash2, Trophy, UserPlus, ArrowRight, ChevronRight, Mail, MailX, Send, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { groupBalances, isGroupAdmin, isGroupSettled, memberAvatar, memberHasActivity, memberName, myMemberId, pokerLeaderboard, reminderMailto, sessionPayments, simplify, summaryMailto } from '../lib/ledger';
import { rummyStandings } from '../lib/rummy';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Avatar, Badge, BalanceText, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, PageHeader, Row, Select, Spinner, Tabs } from '../components/ui';
import { HistoryList } from '../components/HistoryList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KIND_LABEL } from './GroupsPage';
import { ExpenseDialog } from '../components/dialogs/ExpenseDialog';
import { ImportDialog } from '../components/dialogs/ImportDialog';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import { NewGameDialog } from '../components/dialogs/NewGameDialog';
import { NewRummyGameDialog } from '../components/dialogs/NewRummyGameDialog';
import { AddMemberDialog } from '../components/dialogs/AddMemberDialog';
import { CURRENCIES, KindPicker } from '../components/dialogs/CreateGroupDialog';
import type { Expense, Group, GroupKind, Member, Settlement } from '../lib/types';

type Tab = 'games' | 'rummy' | 'balances' | 'expenses' | 'members' | 'history';

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
    ...(g.kind !== 'expenses' ? [{ value: 'games' as Tab, label: 'Games' }] : []),
    ...(g.kind === 'club' ? [{ value: 'rummy' as Tab, label: 'Rummy' }] : []),
    { value: 'balances', label: 'Balances' },
    ...(g.kind !== 'club' || g.expenses.length ? [{ value: 'expenses' as Tab, label: 'Expenses' }] : []),
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
          <Badge tone={g.kind === 'club' ? 'felt' : 'neutral'}>{KIND_LABEL[g.kind]}</Badge>
          <span>{g.members.length} people</span>
          <span>{myBal === 0 ? 'You are settled up' : <>You {myBal > 0 ? 'are owed' : 'owe'} <Amount cents={myBal} currency={g.currency} className="text-sm" /></>}</span>
        </span>}
        actions={<>
          <Button onClick={() => { window.location.href = summaryMailto(g); }}><Send size={16} aria-hidden="true" />Send summary</Button>
          {g.kind !== 'club' && <Button onClick={() => setImportOpen(true)}><Upload size={16} aria-hidden="true" />Import</Button>}
          {g.kind !== 'expenses' && <Button variant={g.kind === 'club' ? 'primary' : 'secondary'} onClick={() => setNewGame(true)}><Spade size={16} aria-hidden="true" />New game</Button>}
          <Button variant={g.kind === 'club' ? 'secondary' : 'primary'} onClick={() => setExpense('new')}><Receipt size={16} aria-hidden="true" />Expense</Button>
        </>}
      />
      <div className="mb-5"><Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} /></div>

      {tab === 'games' && <GamesTab g={g} onNew={() => setNewGame(true)} />}
      {tab === 'rummy' && <RummyTab g={g} />}
      {tab === 'balances' && <BalancesTab g={g} onSettle={setSettle} onAddExpense={() => setExpense('new')} />}
      {tab === 'expenses' && <ExpensesTab g={g} meMember={mine} admin={isGroupAdmin(g, me.id)} onEdit={setExpense} onImport={() => setImportOpen(true)} />}
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
    return <Card><EmptyState icon={<Spade size={28} />} title="Deal the first game" body="Start a game, log buy-ins as people join, and cash-outs when the table breaks."
      action={<Button variant="primary" onClick={onNew}>Start game</Button>} /></Card>;
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Trophy size={16} className="text-brass" aria-hidden="true" />Leaderboard</span>} />
        <div className="mt-2">
          {board.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-2">Finish a game to start the leaderboard.</p> :
            board.map((r, i) => (
              <Row key={r.memberId}>
                <span className="amount w-5 text-center font-display text-sm text-ink-2">{i + 1}</span>
                <Avatar name={r.name} src={r.avatar_url} size={32} />
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
        <CardHeader title="Games" action={<Button size="sm" onClick={onNew}><Plus size={14} aria-hidden="true" />New</Button>} />
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
                    <p className="truncate text-sm font-semibold">{s.location ?? 'Game'}</p>
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

function RummyTab({ g }: { g: Group }) {
  const { api } = useAuth();
  const [newGame, setNewGame] = useState(false);
  const q = useQuery({ queryKey: ['rummy-list', g.id], queryFn: () => api.loadRummyGames(g.id) });

  if (q.isLoading) return <Spinner />;
  const games = q.data ?? [];

  return (
    <Card>
      <CardHeader title="Rummy" action={<Button size="sm" onClick={() => setNewGame(true)}><Plus size={14} aria-hidden="true" />New rummy game</Button>} />
      {games.length === 0 ? (
        <EmptyState icon={<Spade size={28} />} title="No rummy games yet" body="Start one and track points hand by hand, with anyone crossing the point limit marked out."
          action={<Button variant="primary" onClick={() => setNewGame(true)}>Start a rummy game</Button>} />
      ) : (
        <div className="mt-2">
          {games.map((rg) => {
            const leader = rummyStandings(rg)[0];
            return (
              <Link key={rg.id} to={`/rummy/${rg.id}`} className="block">
                <Row className="hover:bg-surface-2/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Spade size={16} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{rg.name || 'Rummy'}</p>
                    <p className="truncate text-[12px] text-ink-2">{rg.players.length} players, out at {rg.point_limit}, {formatDate(rg.created_at)}</p>
                  </div>
                  <Badge tone={rg.status === 'active' ? 'felt' : 'neutral'}>{rg.status === 'active' ? 'Active' : 'Finished'}</Badge>
                  {leader && <span className="hidden text-[12px] text-ink-2 sm:inline">{leader.player.name} leads</span>}
                  <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
                </Row>
              </Link>
            );
          })}
        </div>
      )}
      <NewRummyGameDialog open={newGame} onClose={() => setNewGame(false)} group={g} />
    </Card>
  );
}

function BalancesTab({ g, onSettle, onAddExpense }: { g: Group; onSettle(d: SettleDraft): void; onAddExpense(): void }) {
  const { run, busy } = useAction();
  const [confirmingPayment, setConfirmingPayment] = useState<Settlement | null>(null);
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
                <div key={`${t.from}-${t.to}`}
                  className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3 md:px-5">
                  <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                    <Avatar name={memberName(g, t.from)} src={memberAvatar(g, t.from)} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b className="font-semibold text-loss">{memberName(g, t.from)}</b>
                      <ArrowRight size={14} className="mx-1.5 inline text-ink-2" aria-label="pays" />
                      <b className="font-semibold text-gain">{memberName(g, t.to)}</b>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    <span className="amount font-display font-medium">{formatMoney(t.cents, g.currency)}</span>
                    {reminderMailto(g, t) && (
                      <IconButton label={`Remind ${memberName(g, t.from)}`} title="Email a settle-up reminder"
                        onClick={() => { window.location.href = reminderMailto(g, t)!; }}><Mail size={16} /></IconButton>
                    )}
                    <Button size="sm" onClick={() => onSettle({ from: t.from, to: t.to, cents: t.cents })}>Record</Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Where everyone stands" />
          <div className="mt-2">
            {members.map((m) => (
              <Row key={m.id}>
                <Avatar name={m.name} src={m.avatar_url} size={32} />
                <span className="flex-1 truncate text-sm font-semibold">{m.name}</span>
                <BalanceText cents={bal.get(m.id) ?? 0} currency={g.currency} perspective="them" />
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
                  <p className="truncate text-[12px] text-ink-2">{formatDate(s.settled_on)}{s.method ? `, ${s.method}` : ''}{s.session_id ? ', game' : ''}{s.note ? `, ${s.note}` : ''}</p>
                </div>
                <span className="amount font-display font-medium">{formatMoney(s.amount_cents, g.currency)}</span>
                <IconButton label="Delete payment" onClick={() => setConfirmingPayment(s)}>
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            ))}
        </div>
      </Card>
      <ConfirmDialog open={!!confirmingPayment} onClose={() => setConfirmingPayment(null)} title="Delete this payment?" icon={Trash2} busy={busy}
        body={confirmingPayment && <>This removes the record of <b>{memberName(g, confirmingPayment.from_member)}</b> paying <b>{memberName(g, confirmingPayment.to_member)}</b> <b>{formatMoney(confirmingPayment.amount_cents, g.currency)}</b>. Their balances go back to what they owed before.</>}
        onConfirm={async () => { const id = confirmingPayment!.id; setConfirmingPayment(null); await run((api) => api.deleteSettlement(id), 'Payment deleted'); }} />
    </div>
  );
}

function ExpensesTab({ g, meMember, admin, onEdit, onImport }: { g: Group; meMember?: string; admin: boolean; onEdit(e: Expense | 'new'): void; onImport(): void }) {
  const { run, busy } = useAction();
  const [confirmingExpense, setConfirmingExpense] = useState<Expense | null>(null);
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
                  {admin && (
                    <IconButton label={`Delete ${e.description}`} onClick={() => setConfirmingExpense(e)}>
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </Row>
              );
            })}
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!confirmingExpense} onClose={() => setConfirmingExpense(null)} title="Delete this expense?" icon={Trash2} busy={busy}
        body={confirmingExpense && <>This removes <b>&ldquo;{confirmingExpense.description}&rdquo;</b> ({formatMoney(confirmingExpense.amount_cents, g.currency)}) and everyone's share of it. This can't be undone.</>}
        onConfirm={async () => { const id = confirmingExpense!.id; setConfirmingExpense(null); await run((api) => api.deleteExpense(id), 'Expense deleted'); }} />
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
  const [confirmingRemove, setConfirmingRemove] = useState<Member | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const admin = isGroupAdmin(g, me.id);
  const dirty = name.trim() !== g.name || kind !== g.kind || currency !== g.currency;
  const settled = isGroupSettled(g);
  const finalGames = g.sessions.filter((s) => s.status === 'final').length;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Members" action={<Button size="sm" onClick={() => setAdding(true)}><UserPlus size={14} aria-hidden="true" />Add</Button>} />
        <div className="mt-2">
          {g.members.map((m) => {
            const active = memberHasActivity(g, m.id);
            return (
              <Row key={m.id}>
                <Avatar name={m.name} src={m.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}{m.user_id === me.id && <span className="font-normal text-ink-2"> (you)</span>}</p>
                  <p className="truncate text-[12px] text-ink-2">{m.email ?? 'No email'}</p>
                </div>
                {m.is_admin ? <Badge tone="brass">Admin</Badge> : m.user_id ? <Badge tone="gain">Signed up</Badge> : <Badge>Guest</Badge>}
                {admin && (
                  <IconButton label={m.is_admin ? `Remove ${m.name} as admin` : `Make ${m.name} an admin`}
                    title={m.is_admin ? 'Admin — can change settings, delete the group or expenses' : 'Not an admin'}
                    onClick={() => run((api) => api.setGroupAdmin(m.id, !m.is_admin))}>
                    {m.is_admin ? <ShieldCheck size={16} className="text-brass" /> : <ShieldOff size={16} className="text-ink-2" />}
                  </IconButton>
                )}
                {m.email && (
                  <IconButton label={m.email_opt_out ? `Include ${m.name} in email summaries` : `Exclude ${m.name} from email summaries`}
                    title={m.email_opt_out ? 'Not included in email summaries' : 'Included in email summaries'}
                    onClick={() => run((api) => api.setEmailOptOut(m.id, !m.email_opt_out))}>
                    {m.email_opt_out ? <MailX size={16} className="text-ink-2" /> : <Mail size={16} />}
                  </IconButton>
                )}
                <IconButton label={`Remove ${m.name}`} disabled={active || m.user_id === me.id}
                  title={active ? 'Has games, expenses, or payments in this group' : `Remove ${m.name}`}
                  onClick={() => setConfirmingRemove(m)}>
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            );
          })}
        </div>
        <p className="px-4 pb-4 pt-3 text-[12px] text-ink-2 md:px-5">
          People with history in the group can't be removed, so balances stay correct. Only admins can change group settings, or delete the group or an expense — everyone can still add expenses.
        </p>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="mb-4 font-display text-base font-medium">Group settings</h2>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} disabled={!admin} onChange={(e) => setName(e.target.value)} /></Field>
          <div><span className="mb-1.5 block text-[13px] font-semibold">What's it for</span><KindPicker value={kind} onChange={setKind} disabled={!admin} /></div>
          <Field label="Currency">
            <Select value={currency} disabled={!admin} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          {!admin && <p className="text-[13px] text-ink-2">Only a group admin can change these settings.</p>}
          <div className="flex flex-wrap items-start justify-between gap-2 pt-2">
            {admin ? (
              <div>
                <Button variant="danger" disabled={!settled} title={settled ? undefined : 'Settle up everyone in this group first'}
                  onClick={() => setConfirmingDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete group</Button>
                {!settled && (
                  <p className="mt-1.5 text-[12px] text-ink-2">
                    Not settled yet{' — '}<Link to={`/groups/${g.id}?tab=balances`} className="font-semibold text-felt underline dark:text-gain">settle up</Link> first.
                  </p>
                )}
              </div>
            ) : <span />}
            <Button variant="primary" disabled={!admin || !dirty || !name.trim()} loading={busy}
              onClick={() => run((api) => api.updateGroup(g.id, { name: name.trim(), kind, currency }), 'Group saved')}>Save changes</Button>
          </div>
        </div>
      </Card>
      <AddMemberDialog group={g} open={adding} onClose={() => setAdding(false)} />

      <ConfirmDialog open={!!confirmingRemove} onClose={() => setConfirmingRemove(null)} title="Remove this person?" icon={Trash2} busy={busy}
        body={confirmingRemove && <>This removes <b>{confirmingRemove.name}</b> from {g.name}. They can be added back any time.</>}
        onConfirm={async () => { const id = confirmingRemove!.id, mname = confirmingRemove!.name; setConfirmingRemove(null); await run((api) => api.removeMember(id), `${mname} removed`); }} />

      <ConfirmDialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} title={`Delete ${g.name}?`} icon={Trash2} busy={busy}
        body={<>This permanently deletes <b>{g.members.length} member{g.members.length === 1 ? '' : 's'}</b>
          {finalGames > 0 && <>, <b>{finalGames} game{finalGames === 1 ? '' : 's'}</b></>}
          {g.expenses.length > 0 && <>, <b>{g.expenses.length} expense{g.expenses.length === 1 ? '' : 's'}</b></>}
          {g.settlements.length > 0 && <>, and <b>{g.settlements.length} payment{g.settlements.length === 1 ? '' : 's'}</b></>}. This can't be undone.</>}
        onConfirm={async () => {
          setConfirmingDelete(false);
          const ok = await run((api) => api.deleteGroup(g.id), 'Group deleted');
          if (ok !== undefined) nav('/groups');
        }} />
    </div>
  );
}
