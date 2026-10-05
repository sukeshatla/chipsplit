import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Spade, Receipt, Upload, HandCoins, Trash2, Trophy, UserPlus, ChevronRight, Club, Mail, MailX, Pencil, ShieldCheck, ShieldOff, Share2 } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { useToast } from '../app/toast';
import { useAuth } from '../app/auth';
import { isAppAdmin } from '../lib/admin';
import { groupBalances, isGroupAdmin, isGroupSettled, memberAvatar, memberHasActivity, memberName, memberShort, shortName, myMemberId, pokerLeaderboard, reminderMailto, sessionPayments, simplify, summaryData, summaryMailto, leaderboardData, type Summary } from '../lib/ledger';
import { shareSummaryImage } from '../lib/summaryImage';
import { ActionBar, ActionButton, ShareMenu } from '../components/ActionBar';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Avatar, AvatarButton, BackLink, byMonth, DateTile, LIST_STEP, MonthHeader, ShowMore, useShowMore, Badge, BalanceText, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, PageHeader, Row, Select, Tabs } from '../components/ui';
import { HistoryList } from '../components/HistoryList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KIND_LABEL } from './GroupsPage';
import { ExpenseDialog } from '../components/dialogs/ExpenseDialog';
import { ImportDialog } from '../components/dialogs/ImportDialog';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import { NewGameDialog } from '../components/dialogs/NewGameDialog';
import { MemberCardDialog } from '../components/dialogs/MemberCardDialog';
import { ExpenseDetailDialog } from '../components/dialogs/ExpenseDetailDialog';
import { SettleRow } from '../components/SettleRow';
import { AddMemberDialog } from '../components/dialogs/AddMemberDialog';
import { CURRENCIES, KindPicker } from '../components/dialogs/CreateGroupDialog';
import type { Expense, Group, GroupKind, Member, Settlement } from '../lib/types';

type Tab = 'games' | 'balances' | 'expenses' | 'members' | 'history';

export function GroupPage() {
  const { groupId } = useParams();
  const { me, groups } = useData();
  const g = groups.find((x) => x.id === groupId);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [newGame, setNewGame] = useState(false);
  const [expense, setExpense] = useState<Expense | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settle, setSettle] = useState<SettleDraft | null>(null);

  if (!g) return <Navigate to="/groups" replace />;

  const tabs: { value: Tab; label: string }[] = [
    // A club is games only: games (with the leaderboard under them), then Balances.
    ...(g.kind !== 'expenses' ? [{ value: 'games' as Tab, label: 'Games' }] : []),
    { value: 'balances', label: 'Balances' },
    ...(g.kind !== 'club' || g.expenses.length ? [{ value: 'expenses' as Tab, label: 'Expenses' }] : []),
    { value: 'members', label: 'Members' },
    { value: 'history', label: 'History' },
  ];
  // Rummy used to be a tab; old links (notifications, bookmarks) land on its own page now.
  if (params.get('tab') === 'rummy') return <Navigate to={`/groups/${g.id}/rummy`} replace />;
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : tabs[0]!.value;
  const mine = myMemberId(g, me.id);
  const admin = isGroupAdmin(g, me.id);
  const myBal = mine ? groupBalances(g).get(mine) ?? 0 : 0;

  return (
    <>
      <PageHeader
        back={<BackLink to="/groups" label="Groups" />}
        title={g.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={g.kind === 'club' ? 'felt' : 'neutral'}>{KIND_LABEL[g.kind]}</Badge>
          <span>{g.members.length} people</span>
          <span>{myBal === 0 ? 'You are settled up' : <>You {myBal > 0 ? 'are owed' : 'owe'} <Amount cents={myBal} currency={g.currency} className="text-sm" /></>}</span>
        </span>}
        actions={<><ActionBar>
          <ShareMenu onEmail={() => { window.location.href = summaryMailto(g); }}
            onImage={() => shareSummaryImage(summaryData(g), (id) => memberName(g, id)).catch((e) => toast.push(e instanceof Error ? e.message : "Couldn't share the image", 'error'))} />
          {g.kind === 'club' ? (<>
            <ActionButton primary icon={<Spade size={16} aria-hidden="true" />} onClick={() => setNewGame(true)}>New game</ActionButton>
          </>) : admin && (<>
            <ActionButton icon={<Upload size={16} aria-hidden="true" />} onClick={() => setImportOpen(true)}>Import</ActionButton>
            <ActionButton primary icon={<Receipt size={16} aria-hidden="true" />} onClick={() => setExpense('new')}>Expense</ActionButton>
          </>)}
        </ActionBar>
        {/* Rummy is its own kind of game (rounds and points, not buy-ins), so it gets its own button. */}
        {g.kind === 'club' && <Button className="h-10 rounded-xl" onClick={() => nav(`/groups/${g.id}/rummy`)}><Club size={16} aria-hidden="true" />Rummy</Button>}
        </>}
      />
      <div className="mb-5"><Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} /></div>

      {tab === 'games' && <GamesTab g={g} onNew={() => setNewGame(true)} />}
      {tab === 'balances' && <BalancesTab g={g} onSettle={setSettle} onAddExpense={admin && g.kind !== 'club' ? () => setExpense('new') : undefined} />}
      {tab === 'expenses' && <ExpensesTab g={g} meMember={mine} admin={admin} onEdit={setExpense} onImport={() => setImportOpen(true)} />}
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
  const sessions = g.sessions.slice().sort((a, b) => b.played_on.localeCompare(a.played_on));
  const list = useShowMore(sessions);
  if (sessions.length === 0) {
    return <Card><EmptyState icon={<Spade size={28} />} title="Deal the first game" body="Start a game, log buy-ins as people join, and cash-outs when the table breaks."
      action={<Button variant="primary" onClick={onNew}>Start game</Button>} /></Card>;
  }
  return (<div className="space-y-5">
    <Card>
      <CardHeader title="Games" action={<Button size="sm" onClick={onNew}><Plus size={14} aria-hidden="true" />New</Button>} />
      <div className="mt-2">
        {list.visible.map((s) => {
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
                  <p className="truncate text-[12px] text-ink-2">{s.results.length} players, {formatMoney(pot, g.currency)} in play</p>
                </div>
                {s.status === 'open' ? <Badge tone="brass">In progress</Badge>
                  : unpaid > 0 ? <Badge tone="loss">{unpaid} unpaid</Badge> : <Badge tone="gain">Settled</Badge>}
                <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
              </Row>
            </Link>
          );
        })}
      </div>
      {list.more}
    </Card>
    <Leaderboard g={g} />
  </div>);
}

function Leaderboard({ g }: { g: Group }) {
  const board = pokerLeaderboard(g);
  const list = useShowMore(board);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Trophy size={16} className="text-brass" aria-hidden="true" />Leaderboard</span>}
        action={board.length > 0 && <ShareImageButton make={() => leaderboardData(g)} names={(id) => memberName(g, id)} />} />
      {/* pokerLeaderboard() sums cash-out + chips given back − buy-in over finalized games only; payments never enter it. */}
      <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">All-time table results, not who owes what now.</p>
      <div className="mt-2">
        {board.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-2">Finish a game to start the leaderboard.</p> :
          list.visible.map((r, i) => (
            <Row key={r.memberId}>
              <span className="amount w-5 text-center font-display text-sm text-ink-2">{i + 1}</span>
              <AvatarButton name={r.name} src={r.avatar_url} onClick={() => setCardMember(g.members.find((m) => m.id === r.memberId) ?? null)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{memberShort(g, r.memberId)}</p>
                <p className="truncate text-[12px] text-ink-2">{r.games} games, won {r.wins}, best {formatMoney(r.best, g.currency)}</p>
              </div>
              <Amount cents={r.net} currency={g.currency} sign className="text-base" />
            </Row>
          ))}
      </div>
      {list.more}
      <MemberCardDialog member={cardMember} onClose={() => setCardMember(null)}
        extra={cardMember ? { label: 'All-time at the table', node: <Amount cents={board.find((b) => b.memberId === cardMember.id)?.net ?? 0} currency={g.currency} sign className="text-base" /> } : undefined} />
    </Card>
  );
}

/** A small "Share" that sends a picture of what's on this card. */
function ShareImageButton({ make, names }: { make(): Summary; names(id: string): string }) {
  const toast = useToast();
  return (
    <Button size="sm" onClick={() => shareSummaryImage(make(), names).catch((e) => toast.push(e instanceof Error ? e.message : "Couldn't share the image", 'error'))}>
      <Share2 size={14} aria-hidden="true" />Share
    </Button>
  );
}

function BalancesTab({ g, onSettle, onAddExpense }: { g: Group; onSettle(d: SettleDraft): void; onAddExpense?: () => void }) {
  const { run, busy } = useAction();
  const [confirmingPayment, setConfirmingPayment] = useState<Settlement | null>(null);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  const memberById = (id: string) => g.members.find((m) => m.id === id) ?? null;
  const bal = groupBalances(g);
  // Biggest payment first, and people from most up to most down.
  const transfers = simplify(bal).sort((a, b) => b.cents - a.cents);
  const history = g.settlements.slice().sort((a, b) => b.settled_on.localeCompare(a.settled_on) || b.created_at.localeCompare(a.created_at));
  const payments = useShowMore(history, 10);
  // Up the most first, then those who owe, and anyone settled up last.
  const members = g.members.slice().sort((a, b) => {
    const x = bal.get(a.id) ?? 0, y = bal.get(b.id) ?? 0;
    return Number(x === 0) - Number(y === 0) || y - x || a.name.localeCompare(b.name);
  });
  // Settled-up people stay out of the way until asked for.
  const settledCount = members.filter((m) => (bal.get(m.id) ?? 0) === 0).length;
  const [showSettled, setShowSettled] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Settle up" action={<div className="flex gap-2">
            {onAddExpense && <Button size="sm" onClick={onAddExpense}><Receipt size={14} aria-hidden="true" />Add expense</Button>}
            <ShareImageButton make={() => summaryData(g)} names={(id) => memberName(g, id)} />
          </div>} />
          <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">Fewest payments to clear it all.</p>
          <div className="mt-2">
            {transfers.length === 0 ? <p className="px-5 pb-5 pt-2 text-sm text-ink-2">Everyone is settled up.</p> :
              transfers.map((t) => (
                <SettleRow key={`${t.from}-${t.to}`} fromName={memberName(g, t.from)} fromShort={memberShort(g, t.from)} fromAvatar={memberAvatar(g, t.from)}
                  toShort={memberShort(g, t.to)} amount={formatMoney(t.cents, g.currency)} onAvatar={() => setCardMember(memberById(t.from))}
                  actions={<>
                    {reminderMailto(g, t) && (
                      <Button size="sm" onClick={() => { window.location.href = reminderMailto(g, t)!; }}><Mail size={14} aria-hidden="true" />Remind by email</Button>
                    )}
                    <Button size="sm" variant="primary" onClick={() => onSettle({ from: t.from, to: t.to, cents: t.cents })}><HandCoins size={14} aria-hidden="true" />Record payment</Button>
                  </>} />
              ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Where everyone stands" />
          <div className="mt-2">
            {(showSettled ? members : members.filter((m) => (bal.get(m.id) ?? 0) !== 0)).map((m) => (
              <Row key={m.id}>
                <AvatarButton name={m.name} src={m.avatar_url} onClick={() => setCardMember(m)} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shortName(m.name, g.members.map((x) => x.name))}</span>
                <BalanceText cents={bal.get(m.id) ?? 0} currency={g.currency} perspective="them" />
              </Row>
            ))}
          </div>
          {settledCount > 0 && (
            <div className="flex justify-center border-t border-line px-4 py-2.5">
              <button type="button" className="text-[13px] font-semibold text-felt hover:underline dark:text-gain" onClick={() => setShowSettled((v) => !v)}>
                {showSettled ? 'Hide settled up' : `Show ${settledCount} settled up`}
              </button>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Payments recorded" />
        <div className="mt-2">
          {history.length === 0 ? <p className="px-5 pb-5 pt-2 text-sm text-ink-2">Payments you record show up here.</p> :
            payments.visible.map((s) => (
              <Row key={s.id}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gain/10 text-gain"><HandCoins size={16} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{memberShort(g, s.from_member)} paid {memberShort(g, s.to_member)}</p>
                  <p className="truncate text-[12px] text-ink-2">{formatDate(s.settled_on)}{s.method ? `, ${s.method}` : ''}{s.session_id ? ', game' : ''}{s.note ? `, ${s.note}` : ''}</p>
                </div>
                <span className="amount font-display font-medium">{formatMoney(s.amount_cents, g.currency)}</span>
                <IconButton label="Delete payment" onClick={() => setConfirmingPayment(s)}>
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            ))}
        </div>
        {payments.more}
      </Card>
      <ConfirmDialog open={!!confirmingPayment} onClose={() => setConfirmingPayment(null)} title="Delete this payment?" icon={Trash2} busy={busy}
        body={confirmingPayment && <>This removes the record of <b>{memberName(g, confirmingPayment.from_member)}</b> paying <b>{memberName(g, confirmingPayment.to_member)}</b> <b>{formatMoney(confirmingPayment.amount_cents, g.currency)}</b>. Their balances go back to what they owed before.</>}
        onConfirm={async () => { const id = confirmingPayment!.id; setConfirmingPayment(null); await run((api) => api.deleteSettlement(id), 'Payment deleted'); }} />
      <MemberCardDialog member={cardMember} onClose={() => setCardMember(null)}
        extra={cardMember ? { label: 'In this group', node: <BalanceText cents={bal.get(cardMember.id) ?? 0} currency={g.currency} perspective="them" /> } : undefined} />
    </div>
  );
}

function ExpensesTab({ g, meMember, admin, onEdit, onImport }: { g: Group; meMember?: string; admin: boolean; onEdit(e: Expense | 'new'): void; onImport(): void }) {
  // The open summary lives in the URL (?expense=<id>) so activity and notification links can open it directly.
  const [params, setParams] = useSearchParams();
  const detail = g.expenses.find((e) => e.id === params.get('expense')) ?? null;
  const openDetail = (id: string | null) => setParams(id ? { tab: 'expenses', expense: id } : { tab: 'expenses' }, { replace: true });
  const list = g.expenses.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  const [shown, setShown] = useState(LIST_STEP);
  if (list.length === 0) {
    return <Card><EmptyState icon={<Receipt size={28} />} title={admin ? 'Log the first expense' : 'No expenses yet'}
      body={admin ? 'Add costs as they happen, or bring in a spreadsheet you already keep.' : 'A group admin can add expenses here.'}
      action={admin && <div className="flex gap-2"><Button onClick={onImport}>Import sheet</Button><Button variant="primary" onClick={() => onEdit('new')}>Add expense</Button></div>} /></Card>;
  }
  const total = list.reduce((a, e) => a + e.amount_cents, 0);

  return (
    <Card>
      <CardHeader title={`${list.length} expenses`} action={<span className="amount text-sm text-ink-2">{formatMoney(total, g.currency)} total</span>} />
      <div className="mt-2">
        {byMonth(list.slice(0, shown), (e) => e.spent_on).map(([month, items]) => (
          <div key={month}>
            <MonthHeader month={month} />
            {items.map((e) => {
              const paid = e.payers.find((p) => p.member_id === meMember)?.amount_cents ?? 0;
              const share = e.shares.find((s) => s.member_id === meMember)?.amount_cents ?? 0;
              const impact = paid - share;
              return (
                <Row key={e.id} onClick={() => openDetail(e.id)}>
                  <DateTile date={e.spent_on} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.description}</p>
                    <p className="truncate text-[12px] text-ink-2">
                      {e.payers.map((p) => memberShort(g, p.member_id)).join(' and ')} paid {formatMoney(e.amount_cents, g.currency)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-ink-2">{impact > 0 ? 'you lent' : impact < 0 ? 'you borrowed' : paid || share ? 'even' : 'not involved'}</p>
                    {impact !== 0 && <Amount cents={impact} currency={g.currency} className="text-sm" />}
                  </div>
                </Row>
              );
            })}
          </div>
        ))}
      </div>
      <ShowMore shown={shown} total={list.length} onAll={() => setShown(list.length)} />
      <ExpenseDetailDialog group={g} expense={detail} onClose={() => openDetail(null)}
        onEdit={(e) => { openDetail(null); onEdit(e); }} />
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
  const [cardId, setCardId] = useState<string | null>(null);
  const cardMember = g.members.find((m) => m.id === cardId) ?? null; // looked up live so toggles show their new state
  const admin = isGroupAdmin(g, me.id);
  const dirty = name.trim() !== g.name || kind !== g.kind || currency !== g.currency;
  const settled = isGroupSettled(g);
  const finalGames = g.sessions.filter((s) => s.status === 'final').length;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Members" action={<Button size="sm" onClick={() => setAdding(true)}><UserPlus size={14} aria-hidden="true" />Add</Button>} />
        <div className="mt-2">
          {g.members.map((m) => (
            <Row key={m.id} onClick={() => setCardId(m.id)}>
              <Avatar name={m.name} src={m.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.name}{m.user_id === me.id && <span className="font-normal text-ink-2"> (you)</span>}</p>
                <p className="truncate text-[12px] text-ink-2">{m.email ?? 'No email'}</p>
              </div>
              {m.is_admin ? <Badge tone="brass">Admin</Badge> : m.user_id ? <Badge tone="gain">Signed up</Badge> : <Badge>Guest</Badge>}
              <ChevronRight size={16} className="shrink-0 text-ink-2" aria-hidden="true" />
            </Row>
          ))}
        </div>
        <p className="px-4 pb-4 pt-3 text-[12px] text-ink-2 md:px-5">
          Tap someone to manage them. Only admins can add, edit, or delete expenses, change group settings, or delete the group. People with history in the group can't be removed, so balances stay correct.
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
      <MemberCardDialog member={cardMember} onClose={() => setCardId(null)}
        actions={cardMember && <MemberActions key={cardMember.id} g={g} m={cardMember} admin={admin} busy={busy}
          onToggleAdmin={() => run((api) => api.setGroupAdmin(cardMember.id, !cardMember.is_admin))}
          onToggleEmail={() => run((api) => api.setEmailOptOut(cardMember.id, !cardMember.email_opt_out))}
          onRemove={() => { setCardId(null); setConfirmingRemove(cardMember); }}
          onEditPerson={(name, email) => run((api) => api.updatePerson(cardMember.id, name, email), 'Saved')} />} />

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

function MemberActions({ g, m, admin, busy, onToggleAdmin, onToggleEmail, onRemove, onEditPerson }: {
  g: Group; m: Member; admin: boolean; busy: boolean; onToggleAdmin(): void; onToggleEmail(): void; onRemove(): void;
  onEditPerson(name: string, email: string | null): Promise<unknown>;
}) {
  const { me } = useData();
  const { mode } = useAuth();
  const active = memberHasActivity(g, m.id);
  const isMe = m.user_id === me.id;
  // Only the app admin fixes other people's names and emails (0023 enforces it); the demo user
  // stands in for the admin so the demo shows it.
  const canEdit = isAppAdmin(me.email) || mode === 'demo';
  const [edit, setEdit] = useState<{ name: string; email: string } | null>(null);
  const name = edit?.name.trim() ?? '', email = edit?.email.trim().toLowerCase() ?? '';
  const emailOk = !email || /^\S+@\S+\.\S+$/.test(email);
  const save = async () => {
    if (!name || !emailOk) return;
    if (name !== m.name || email !== (m.email ?? '').toLowerCase()) await onEditPerson(name, email || null);
    setEdit(null);
  };
  return <>
    {canEdit && !m.user_id && (edit === null ? (
      <Button className="w-full" disabled={busy} onClick={() => setEdit({ name: m.name, email: m.email ?? '' })}><Pencil size={16} aria-hidden="true" />Edit name & email</Button>
    ) : (
      <div className="space-y-2 rounded-xl border border-line p-3">
        <Field label="Name"><Input autoFocus value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Email" error={emailOk ? null : 'That email looks incomplete'} hint="Updates them in every group and friends list. An email that already has an account links to it.">
          <Input type="email" value={edit.email} placeholder="Optional" onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name || !emailOk} onClick={() => void save()}>Save</Button>
        </div>
      </div>
    ))}
    {canEdit && m.user_id && !isMe && <p className="text-center text-[12px] text-ink-2">They have an account, so their name and email come from it.</p>}
    {admin && (
      <Button className="w-full" disabled={busy} onClick={onToggleAdmin}>
        {m.is_admin ? <><ShieldOff size={16} aria-hidden="true" />Remove as admin</> : <><ShieldCheck size={16} aria-hidden="true" />Make admin</>}
      </Button>
    )}
    {m.email && (
      <Button className="w-full" disabled={busy} onClick={onToggleEmail}>
        {m.email_opt_out ? <><Mail size={16} aria-hidden="true" />Include in email summaries</> : <><MailX size={16} aria-hidden="true" />Leave out of email summaries</>}
      </Button>
    )}
    <Button variant="danger" className="w-full" disabled={busy || active || isMe} onClick={onRemove}>
      <Trash2 size={16} aria-hidden="true" />Remove from group
    </Button>
    {(active || isMe) && (
      <p className="text-center text-[12px] text-ink-2">{isMe ? "You can't remove yourself." : 'Has games, expenses, or payments here, so they stay to keep balances right.'}</p>
    )}
  </>;
}
