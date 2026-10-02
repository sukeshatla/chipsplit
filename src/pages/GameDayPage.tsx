import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, Lock, Minus, LockOpen, Mail, Plus, RotateCcw, Save, Send, Trash2, UserPlus, X } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { isGroupAdmin, isSessionSettled, memberAvatar, memberName, memberShort, resultNet, reminderMailto, sessionPayments, sessionTotals, summaryMailto } from '../lib/ledger';
import { centsToInput, formatDate, formatMoney, parseMoney, todayISO } from '../lib/money';
import { Amount, AvatarButton, BackLink, enterToNext, Badge, Button, Card, CardHeader, IconButton, Modal, MoneyInput, PageHeader, Row, Select, Tabs } from '../components/ui';
import { HistoryList } from '../components/HistoryList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AddMemberDialog } from '../components/dialogs/AddMemberDialog';
import { MemberCardDialog } from '../components/dialogs/MemberCardDialog';
import { SettleRow } from '../components/SettleRow';
import type { GameSession, Group, Member } from '../lib/types';

/** One player while the game is open. `returned` (cents) is chips handed back to the bank mid-game. */
interface Line { member_id: string; buyIn: string; cashOut: string; returned: number }

export function GameDayPage() {
  const { groupId, gameId } = useParams();
  const { groups } = useData();
  const g = groups.find((x) => x.id === groupId);
  const s = g?.sessions.find((x) => x.id === gameId);
  if (!g || !s) return <Navigate to={g ? `/groups/${g.id}` : '/groups'} replace />;
  // Remount the editor whenever saved results change so inputs reflect the stored values.
  const sig = s.results.map((r) => `${r.member_id}:${r.buy_in_cents}:${r.cash_out_cents}:${r.returned_cents ?? 0}`).join('|');
  return <GameDayEditor key={`${s.id}|${sig}`} g={g} s={s} />;
}

function GameDayEditor({ g, s }: { g: Group; s: GameSession }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const final = s.status === 'final';
  const [lines, setLines] = useState<Line[]>(() => s.results.map((r) => ({
    member_id: r.member_id, buyIn: centsToInput(r.buy_in_cents), cashOut: centsToInput(r.cash_out_cents), returned: r.returned_cents ?? 0,
  })));
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState('');
  const [newPerson, setNewPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  const [givingBack, setGivingBack] = useState<string | null>(null); // member_id whose give-back popup is open
  // Phones show one number column at a time: buy-ins while playing, cash-outs when the table breaks.
  const [entry, setEntry] = useState<'buyin' | 'cashout'>(() => (s.results.some((r) => r.cash_out_cents > 0) ? 'cashout' : 'buyin'));
  const rebuy = s.default_buy_in_cents || 5000;
  const admin = isGroupAdmin(g, me.id);
  const settled = isSessionSettled(g, s);

  const parsed = useMemo(() => lines.map((l) => ({
    member_id: l.member_id, buy_in_cents: parseMoney(l.buyIn) ?? 0, cash_out_cents: parseMoney(l.cashOut) ?? 0, returned_cents: l.returned,
  })), [lines]);
  const totalIn = parsed.reduce((a, r) => a + r.buy_in_cents, 0);
  // Chips given back left the table just like a cash-out, so they count on the "out" side.
  const totalOut = parsed.reduce((a, r) => a + r.cash_out_cents + r.returned_cents, 0);
  const diff = totalOut - totalIn;
  const balanced = diff === 0 && lines.length >= 2;
  const notPlaying = g.members.filter((m) => !lines.some((l) => l.member_id === m.id));

  const edit = (id: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.member_id === id ? { ...l, ...patch } : l)));
    setDirty(true); setError(null);
  };
  const addLine = (id: string) => {
    if (!id) return;
    setLines((ls) => [...ls, { member_id: id, buyIn: centsToInput(rebuy), cashOut: '', returned: 0 }]);
    setDirty(true); setAdding('');
  };
  const validate = () => {
    if (parsed.some((r) => r.buy_in_cents < 0 || r.cash_out_cents < 0)) return 'Amounts can\'t be negative';
    const bad = lines.find((l) => (l.buyIn && parseMoney(l.buyIn) === null) || (l.cashOut && parseMoney(l.cashOut) === null));
    if (bad) return `Check the numbers for ${memberName(g, bad.member_id)}`;
    return null;
  };
  const save = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    await run((api) => api.saveSessionResults(s.id, parsed), 'Game saved');
  };
  const finalize = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    if (lines.length < 2) { setError('Add at least two players'); return; }
    if (diff !== 0) { setError(`Cash-outs are ${formatMoney(Math.abs(diff), g.currency)} ${diff > 0 ? 'more' : 'less'} than buy-ins. Recount the chips or fix an entry.`); return; }
    await run(async (api) => {
      await api.saveSessionResults(s.id, parsed);
      await api.updateSession(s.id, { status: 'final' });
    }, 'Game finalized');
  };
  const paidSettlements = g.settlements.some((x) => x.session_id === s.id);
  const reopen = () => {
    if (paidSettlements) { setConfirmReopen(true); return; }
    run((api) => api.updateSession(s.id, { status: 'open' }), 'Game reopened');
  };
  const pot = sessionTotals(s).buyIn;

  return (
    <>
      <PageHeader
        back={<BackLink to={`/groups/${g.id}?tab=games`} label={g.name} />}
        title={formatDate(s.played_on, { weekday: 'long', month: 'long', day: 'numeric' })}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {final ? <Badge tone="gain"><Lock size={12} aria-hidden="true" />Final</Badge> : <Badge tone="brass">In progress</Badge>}
          {s.location && <span>{s.location}</span>}
          <span>{lines.length} players</span>
        </span>}
        actions={<>
          {final && <Button onClick={() => { window.location.href = summaryMailto(g, s.id); }}><Send size={16} aria-hidden="true" />Send summary</Button>}
          {final ? (
            <Button onClick={reopen}><LockOpen size={16} aria-hidden="true" />Reopen</Button>
          ) : (<>
            <Button disabled={!dirty} loading={busy && dirty} onClick={save}><Save size={16} aria-hidden="true" />Save</Button>
            <Button variant="primary" onClick={finalize} loading={busy && !dirty}><Check size={16} aria-hidden="true" />Finalize</Button>
          </>)}
        </>}
      />

      <section className={clsx('z-20 mb-4 rounded-xl px-3 py-2 md:mb-5 md:rounded-2xl md:p-5', !final && 'sticky top-1 shadow-md md:static md:shadow-none',
        balanced ? 'felt' : 'border border-line bg-surface')}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-3 md:gap-8">
            <p><span className="text-[12px] opacity-80 md:block md:text-sm">In </span><span className="amount font-display text-base font-medium md:text-3xl">{formatMoney(totalIn, g.currency)}</span></p>
            <p><span className="text-[12px] opacity-80 md:block md:text-sm">Out </span><span className="amount font-display text-base font-medium md:text-3xl">{formatMoney(totalOut, g.currency)}</span></p>
          </div>
          <p className={clsx('min-w-0 text-[12px] font-semibold md:text-sm', !balanced && (diff === 0 || totalOut === 0 ? 'text-ink-2' : 'text-loss'))}>
            {balanced ? 'Table balances' : lines.length < 2 ? 'Add 2+ players'
              : totalOut === 0 ? (final ? '' : 'Playing')
                : `${formatMoney(Math.abs(diff), g.currency)} ${diff > 0 ? 'over' : 'short'}`}
          </p>
        </div>
      </section>
      {error && <p role="alert" className="mb-4 rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}

      <div className="space-y-5">
        <Card>
          <CardHeader title={`Players (${lines.length})`} />
          {!final && <>
            <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_210px_140px_90px_36px] gap-3 px-5 text-[12px] font-semibold text-ink-2 md:grid">
              <span>Player</span><span>Buy-in <span className="font-normal">(− give back, + rebuy)</span></span><span>Cash-out</span><span className="text-right">Net</span><span />
            </div>
            <div className="mt-2 px-4 md:hidden">
              <Tabs<'buyin' | 'cashout'> value={entry} onChange={setEntry} tabs={[{ value: 'buyin', label: 'Buy-ins' }, { value: 'cashout', label: 'Cash-outs' }]} />
            </div>
          </>}
          <div className="mt-1">
            {lines.map((l) => {
              const r = parsed.find((x) => x.member_id === l.member_id)!;
              const net = resultNet(r);
              const name = memberName(g, l.member_id);
              const remove = () => { setLines((ls) => ls.filter((x) => x.member_id !== l.member_id)); setDirty(true); };
              const openCard = () => setCardMember(g.members.find((m) => m.id === l.member_id) ?? null);
              if (final) {
                return (
                  <Row key={l.member_id} className="py-2.5">
                    <AvatarButton name={name} src={memberAvatar(g, l.member_id)} size={30} onClick={openCard} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{memberShort(g, l.member_id)}</p>
                      <p className="amount truncate text-[12px] text-ink-2">In {formatMoney(r.buy_in_cents, g.currency)}{r.returned_cents > 0 && ` · Back ${formatMoney(r.returned_cents, g.currency)}`} · Out {formatMoney(r.cash_out_cents, g.currency)}</p>
                    </div>
                    <Amount cents={net} currency={g.currency} sign className="text-base" />
                  </Row>
                );
              }
              return (
                <div key={l.member_id} className="flex items-center gap-2 border-b border-line px-4 py-1.5 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_210px_140px_90px_36px] md:gap-3 md:px-5 md:py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <AvatarButton name={name} src={memberAvatar(g, l.member_id)} size={28} onClick={openCard} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">{memberShort(g, l.member_id)}</p>
                      <p className="text-[11px] leading-tight text-ink-2 md:hidden">
                        {entry === 'cashout' ? (l.cashOut ? <Amount cents={net} currency={g.currency} sign className="text-[11px]" /> : `in ${formatMoney(r.buy_in_cents, g.currency)}${r.returned_cents > 0 ? ` · back ${formatMoney(r.returned_cents, g.currency)}` : ''}`)
                          : l.returned > 0 ? <span className="text-brass">gave back {formatMoney(l.returned, g.currency)}</span>
                            : l.cashOut ? `out ${formatMoney(r.cash_out_cents, g.currency)}` : 'playing'}
                      </p>
                    </div>
                  </div>
                  <div className={clsx('w-[10.5rem] shrink-0 items-center gap-1 md:order-2 md:flex md:w-auto', entry === 'buyin' ? 'flex' : 'hidden')}>
                    <IconButton label={`${name} gives chips back`} className="h-9 w-8 shrink-0 border border-line"
                      onClick={() => setGivingBack(l.member_id)}><Minus size={16} /></IconButton>
                    <MoneyInput compact aria-label={`${name} buy-in`} className="flex-1" value={l.buyIn} placeholder="0"
                      data-entry="buyin" enterKeyHint="next" onKeyDown={enterToNext}
                      onChange={(e) => edit(l.member_id, { buyIn: e.target.value })} />
                    <IconButton label={`Rebuy ${formatMoney(rebuy, g.currency)} for ${name}`} className="h-9 w-8 shrink-0 border border-line"
                      onClick={() => edit(l.member_id, { buyIn: centsToInput(r.buy_in_cents + rebuy) })}><Plus size={16} /></IconButton>
                  </div>
                  <div className={clsx('w-28 shrink-0 md:order-3 md:block md:w-auto', entry === 'cashout' ? 'block' : 'hidden')}>
                    <MoneyInput compact aria-label={`${name} cash-out`} value={l.cashOut} placeholder="0"
                      data-entry="cashout" enterKeyHint="next" onKeyDown={enterToNext}
                      onChange={(e) => edit(l.member_id, { cashOut: e.target.value })} />
                  </div>
                  <div className="hidden justify-end md:order-4 md:flex">
                    {l.cashOut ? <Amount cents={net} currency={g.currency} sign /> : <span className="text-[13px] text-ink-2">playing</span>}
                  </div>
                  <div className="hidden md:order-5 md:block">
                    <IconButton label={`Remove ${name}`} onClick={remove}><X size={16} /></IconButton>
                  </div>
                </div>
              );
            })}
          </div>
          {!final && (
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5 md:px-5 md:py-3">
              {notPlaying.length > 0 && (
                <Select aria-label="Add a player" className="w-auto min-w-[160px] flex-1" value={adding} onChange={(e) => addLine(e.target.value)}>
                  <option value="">Add player</option>
                  {notPlaying.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              )}
              <Button onClick={() => setNewPerson(true)}><UserPlus size={16} aria-hidden="true" />New person</Button>
            </div>
          )}
          {!final && <p className="px-4 pb-3 text-[12px] text-ink-2 md:px-5">+ adds a {formatMoney(rebuy, g.currency)} rebuy; − is chips given back to the bank, any number of times. <span className="md:hidden">Next on the keyboard jumps to the next player; tap an avatar to remove someone.</span></p>}
        </Card>

        {final && <Payments g={g} s={s} />}
        <HistoryList g={g} entityId={s.id} />
      </div>
      <MemberCardDialog member={cardMember} onClose={() => setCardMember(null)}
        actions={!final && cardMember && lines.some((l) => l.member_id === cardMember.id) && (
          <Button variant="danger" className="w-full" onClick={() => {
            setLines((ls) => ls.filter((x) => x.member_id !== cardMember.id)); setDirty(true); setCardMember(null);
          }}><X size={16} aria-hidden="true" />Remove from this game</Button>
        )} />
      {givingBack && (
        <GiveBackDialog name={memberShort(g, givingBack)} currency={g.currency} rebuy={rebuy}
          returned={lines.find((l) => l.member_id === givingBack)?.returned ?? 0}
          onSet={(cents) => { edit(givingBack, { returned: cents }); }} onClose={() => setGivingBack(null)} />
      )}
      <AddMemberDialog group={g} open={newPerson} onClose={() => setNewPerson(false)} onAdded={(id) => addLine(id)} />
      {admin && (
        <div className="mt-8 flex justify-center">
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden="true" />Delete game</Button>
        </div>
      )}

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this game?" icon={Trash2}
        confirmLabel="Delete game" busy={busy}
        blocked={final && !settled ? 'Settle up everyone at this table first — open Settle up below to record the remaining payments.' : undefined}
        body={<>This removes <b>{lines.length} player{lines.length === 1 ? '' : 's'}</b>{final ? <> and <b>{formatMoney(pot, g.currency)}</b> in recorded buy-ins</> : ''} for good. This can't be undone.</>}
        onConfirm={async () => {
          const ok = await run((api) => api.deleteSession(s.id), 'Game deleted');
          if (ok !== undefined) nav(`/groups/${g.id}?tab=games`);
        }} />

      <ConfirmDialog open={confirmReopen} onClose={() => setConfirmReopen(false)} title="Reopen this game?" tone="primary" icon={LockOpen}
        confirmLabel="Reopen" busy={busy}
        body="Payments already recorded for this game will stay recorded, even if the numbers change once you edit results again."
        onConfirm={() => { setConfirmReopen(false); run((api) => api.updateSession(s.id, { status: 'open' }), 'Game reopened'); }} />
    </>
  );
}

function Payments({ g, s }: { g: Group; s: GameSession }) {
  const { run, busy } = useAction();
  const pays = sessionPayments(g, s);
  const done = pays.filter((p) => p.settlementId).length;
  const [cardMember, setCardMember] = useState<Member | null>(null);
  return (
    <Card>
      <CardHeader title="Settle up" action={<span className="text-[13px] text-ink-2">{done} of {pays.length} paid</span>} />
      <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">{pays.length} payment{pays.length === 1 ? '' : 's'} square this table.</p>
      <div className="mt-2">
        {pays.length === 0 && <p className="px-5 pb-5 text-sm text-ink-2">Everyone broke even.</p>}
        {pays.map((p) => (
          <SettleRow key={`${p.from}-${p.to}`} fromName={memberName(g, p.from)} fromShort={memberShort(g, p.from)} fromAvatar={memberAvatar(g, p.from)}
            toShort={memberShort(g, p.to)} amount={formatMoney(p.cents, g.currency)} done={!!p.settlementId}
            onAvatar={() => setCardMember(g.members.find((m) => m.id === p.from) ?? null)}
            actions={p.settlementId ? (
              <Button size="sm" disabled={busy} onClick={() => run((api) => api.deleteSettlement(p.settlementId!), 'Marked unpaid')}>
                <RotateCcw size={14} aria-hidden="true" />Undo paid
              </Button>
            ) : (<>
              {reminderMailto(g, p) && (
                <Button size="sm" onClick={() => { window.location.href = reminderMailto(g, p)!; }}><Mail size={14} aria-hidden="true" />Remind by email</Button>
              )}
              <Button size="sm" variant="primary" disabled={busy} onClick={() => run((api) => api.addSettlement({
                group_id: g.id, from_member: p.from, to_member: p.to, amount_cents: p.cents, method: 'Cash',
                note: `Game ${formatDate(s.played_on, { month: 'short', day: 'numeric' })}`, session_id: s.id, settled_on: todayISO(),
              }), 'Marked paid')}>
                <Check size={14} aria-hidden="true" />Mark paid
              </Button>
            </>)} />
        ))}
      </div>
      <MemberCardDialog member={cardMember} onClose={() => setCardMember(null)} />
    </Card>
  );
}

/** Chips a player hands back to the bank mid-game (so someone else can buy in). Opens as a
 *  one-tap confirm for the rebuy amount -- no keyboard -- and only shows an amount box if you
 *  tap Change. Adds to their running "given back" total, which can be cleared to fix a mistake. */
function GiveBackDialog({ name, currency, rebuy, returned, onSet, onClose }: {
  name: string; currency: string; rebuy: number; returned: number; onSet(cents: number): void; onClose(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(centsToInput(rebuy));
  const cents = parseMoney(amount);
  const valid = cents !== null && cents > 0;
  return (
    <Modal open onClose={onClose} title={`${name} gives back`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} onClick={() => { onSet(returned + cents!); onClose(); }}>
          <Minus size={16} aria-hidden="true" />Give back{valid ? ` ${formatMoney(cents!, currency)}` : ''}
        </Button>
      </>}>
      {editing ? (
        <MoneyInput autoFocus aria-label="Amount given back" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
      ) : (
        <div className="flex items-center justify-between">
          <span className="amount font-display text-2xl font-medium">{valid ? formatMoney(cents!, currency) : '—'}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change</Button>
        </div>
      )}
      {returned > 0 && (
        <p className="mt-2 text-[13px] text-ink-2">
          Already gave back <b className="amount">{formatMoney(returned, currency)}</b> ·{' '}
          <button type="button" className="font-semibold text-loss hover:underline" onClick={() => { onSet(0); onClose(); }}>Clear</button>
        </p>
      )}
    </Modal>
  );
}
