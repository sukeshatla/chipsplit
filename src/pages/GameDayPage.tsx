import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ArrowRight, Check, Lock, LockOpen, Mail, Plus, RotateCcw, Save, Send, Trash2, UserPlus, X } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { isGroupAdmin, isSessionSettled, memberAvatar, memberName, myMemberId, reminderMailto, sessionPayments, sessionTotals, summaryMailto } from '../lib/ledger';
import { centsToInput, formatDate, formatMoney, parseMoney, todayISO } from '../lib/money';
import { Amount, Avatar, BackLink, Badge, Button, Card, CardHeader, Field, IconButton, Input, MoneyInput, PageHeader, Row, Select, Textarea } from '../components/ui';
import { HistoryList } from '../components/HistoryList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AddMemberDialog } from '../components/dialogs/AddMemberDialog';
import type { GameSession, Group } from '../lib/types';

interface Line { member_id: string; buyIn: string; cashOut: string }

export function GameDayPage() {
  const { groupId, gameId } = useParams();
  const { groups } = useData();
  const g = groups.find((x) => x.id === groupId);
  const s = g?.sessions.find((x) => x.id === gameId);
  if (!g || !s) return <Navigate to={g ? `/groups/${g.id}` : '/groups'} replace />;
  // Remount the editor whenever saved results change so inputs reflect the stored values.
  const sig = s.results.map((r) => `${r.member_id}:${r.buy_in_cents}:${r.cash_out_cents}`).join('|');
  return <GameDayEditor key={`${s.id}|${sig}`} g={g} s={s} />;
}

function GameDayEditor({ g, s }: { g: Group; s: GameSession }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const final = s.status === 'final';
  const [lines, setLines] = useState<Line[]>(() => s.results.map((r) => ({
    member_id: r.member_id, buyIn: centsToInput(r.buy_in_cents), cashOut: centsToInput(r.cash_out_cents),
  })));
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState('');
  const [newPerson, setNewPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const rebuy = s.default_buy_in_cents || 5000;
  const admin = isGroupAdmin(g, me.id);
  const settled = isSessionSettled(g, s);

  const parsed = useMemo(() => lines.map((l) => ({
    member_id: l.member_id, buy_in_cents: parseMoney(l.buyIn) ?? 0, cash_out_cents: parseMoney(l.cashOut) ?? 0,
  })), [lines]);
  const totalIn = parsed.reduce((a, r) => a + r.buy_in_cents, 0);
  const totalOut = parsed.reduce((a, r) => a + r.cash_out_cents, 0);
  const diff = totalOut - totalIn;
  const balanced = diff === 0 && lines.length >= 2;
  const notPlaying = g.members.filter((m) => !lines.some((l) => l.member_id === m.id));
  const mine = myMemberId(g, me.id);
  const myResult = parsed.find((r) => r.member_id === mine);

  const edit = (id: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.member_id === id ? { ...l, ...patch } : l)));
    setDirty(true); setError(null);
  };
  const addLine = (id: string) => {
    if (!id) return;
    setLines((ls) => [...ls, { member_id: id, buyIn: centsToInput(rebuy), cashOut: '' }]);
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

      <section className={clsx('mb-5 rounded-2xl p-4 md:p-5', balanced ? 'felt' : 'border border-line bg-surface')}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-6 md:gap-8">
            <div><p className="text-sm opacity-80">Bought in</p><p className="amount font-display text-2xl font-medium md:text-3xl">{formatMoney(totalIn, g.currency)}</p></div>
            <div><p className="text-sm opacity-80">Cashed out</p><p className="amount font-display text-2xl font-medium md:text-3xl">{formatMoney(totalOut, g.currency)}</p></div>
          </div>
          <p className={clsx('text-sm font-semibold', !balanced && (diff === 0 || totalOut === 0 ? 'text-ink-2' : 'text-loss'))}>
            {balanced ? 'The table balances.' : lines.length < 2 ? 'Add at least two players.'
              : totalOut === 0 ? 'Enter cash-outs when the table breaks.'
                : `${formatMoney(Math.abs(diff), g.currency)} ${diff > 0 ? 'more out than in' : 'still unaccounted for'}`}
          </p>
        </div>
      </section>
      {error && <p role="alert" className="mb-4 rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}

      <div className="space-y-5">
        <Card>
          <CardHeader title="Players" action={final && myResult && <span className="text-[13px] text-ink-2">You: <Amount cents={myResult.cash_out_cents - myResult.buy_in_cents} currency={g.currency} sign /></span>} />
          <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_170px_140px_90px_36px] gap-3 px-5 text-[12px] font-semibold text-ink-2 md:grid">
            <span>Player</span><span>Buy-in</span><span>Cash-out</span><span className="text-right">Net</span><span />
          </div>
          <div className="mt-1">
            {lines.map((l) => {
              const r = parsed.find((x) => x.member_id === l.member_id)!;
              const net = r.cash_out_cents - r.buy_in_cents;
              const name = memberName(g, l.member_id);
              const remove = () => { setLines((ls) => ls.filter((x) => x.member_id !== l.member_id)); setDirty(true); };
              return (
                <div key={l.member_id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_170px_140px_90px_36px] md:px-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={name} src={memberAvatar(g, l.member_id)} size={30} />
                    <span className="truncate text-sm font-semibold">{name}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1 md:order-4">
                    {final || l.cashOut ? <Amount cents={net} currency={g.currency} sign /> : <span className="text-[13px] text-ink-2">playing</span>}
                    {!final && <IconButton className="md:hidden" label={`Remove ${name}`} onClick={remove}><X size={16} /></IconButton>}
                  </div>
                  <div className="md:order-2">
                    <span className="mb-1 block text-[11px] font-semibold text-ink-2 md:hidden">Buy-in</span>
                    {final ? <p className="amount text-sm">{formatMoney(r.buy_in_cents, g.currency)}</p> : (
                      <div className="flex items-center gap-1">
                        <MoneyInput aria-label={`${name} buy-in`} className="flex-1" value={l.buyIn} placeholder="0"
                          onChange={(e) => edit(l.member_id, { buyIn: e.target.value })} />
                        <IconButton label={`Rebuy ${formatMoney(rebuy, g.currency)} for ${name}`}
                          onClick={() => edit(l.member_id, { buyIn: centsToInput(r.buy_in_cents + rebuy) })}><Plus size={16} /></IconButton>
                      </div>
                    )}
                  </div>
                  <div className="md:order-3">
                    <span className="mb-1 block text-[11px] font-semibold text-ink-2 md:hidden">Cash-out</span>
                    {final ? <p className="amount text-sm">{formatMoney(r.cash_out_cents, g.currency)}</p> : (
                      <MoneyInput aria-label={`${name} cash-out`} value={l.cashOut} placeholder="0"
                        onChange={(e) => edit(l.member_id, { cashOut: e.target.value })} />
                    )}
                  </div>
                  <div className="hidden md:order-5 md:block">
                    {!final && <IconButton label={`Remove ${name}`} onClick={remove}><X size={16} /></IconButton>}
                  </div>
                </div>
              );
            })}
          </div>
          {!final && (
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 md:px-5">
              {notPlaying.length > 0 && (
                <Select aria-label="Add a player" className="w-auto min-w-[160px] flex-1" value={adding} onChange={(e) => addLine(e.target.value)}>
                  <option value="">Add a player from the group</option>
                  {notPlaying.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              )}
              <Button onClick={() => setNewPerson(true)}><UserPlus size={16} aria-hidden="true" />New person</Button>
            </div>
          )}
          {!final && <p className="px-4 pb-4 text-[12px] text-ink-2 md:px-5">The + next to a buy-in adds a rebuy of {formatMoney(rebuy, g.currency)}.</p>}
        </Card>

        <div className="grid items-start gap-5 md:grid-cols-2">
          {final ? <Payments g={g} s={s} /> : (
            <Card className="p-5">
              <h2 className="font-display text-base font-medium">Settle up</h2>
              <p className="mt-1 text-sm text-ink-2">Once the table balances, finalize the game to see who pays whom.</p>
            </Card>
          )}
          <Details s={s} />
        </div>
        <HistoryList g={g} entityId={s.id} />
      </div>
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
  return (
    <Card>
      <CardHeader title="Settle up" action={<span className="text-[13px] text-ink-2">{done} of {pays.length} paid</span>} />
      <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">{pays.length} payment{pays.length === 1 ? '' : 's'} square this table.</p>
      <div className="mt-2">
        {pays.length === 0 && <p className="px-5 pb-5 text-sm text-ink-2">Everyone broke even.</p>}
        {pays.map((p) => (
          <Row key={`${p.from}-${p.to}`} className={p.settlementId ? 'opacity-60' : ''}>
            <span className="min-w-0 flex-1 truncate text-sm">
              <b className="font-semibold">{memberName(g, p.from)}</b>
              <ArrowRight size={14} className="mx-1.5 inline text-ink-2" aria-label="pays" />
              <b className="font-semibold">{memberName(g, p.to)}</b>
            </span>
            <span className={clsx('amount font-display font-medium', p.settlementId && 'line-through')}>{formatMoney(p.cents, g.currency)}</span>
            {!p.settlementId && reminderMailto(g, p) && (
              <IconButton label={`Remind ${memberName(g, p.from)}`} title="Email a settle-up reminder"
                onClick={() => { window.location.href = reminderMailto(g, p)!; }}><Mail size={16} /></IconButton>
            )}
            {p.settlementId ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run((api) => api.deleteSettlement(p.settlementId!), 'Marked unpaid')}>
                <RotateCcw size={14} aria-hidden="true" />Undo
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => run((api) => api.addSettlement({
                group_id: g.id, from_member: p.from, to_member: p.to, amount_cents: p.cents, method: 'Cash',
                note: `Game ${formatDate(s.played_on, { month: 'short', day: 'numeric' })}`, session_id: s.id, settled_on: todayISO(),
              }), 'Marked paid')}>
                <Check size={14} aria-hidden="true" />Paid
              </Button>
            )}
          </Row>
        ))}
      </div>
    </Card>
  );
}

function Details({ s }: { s: GameSession }) {
  const { run, busy } = useAction();
  const [date, setDate] = useState(s.played_on);
  const [location, setLocation] = useState(s.location ?? '');
  const [notes, setNotes] = useState(s.notes ?? '');
  const [buyIn, setBuyIn] = useState(centsToInput(s.default_buy_in_cents));
  const dirty = date !== s.played_on || location !== (s.location ?? '') || notes !== (s.notes ?? '') || buyIn !== centsToInput(s.default_buy_in_cents);
  return (
    <Card className="p-4 md:p-5">
      <h2 className="mb-3 font-display text-base font-medium">Details</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Rebuy amount"><MoneyInput value={buyIn} onChange={(e) => setBuyIn(e.target.value)} /></Field>
        <Field label="Where you're playing (optional)" className="col-span-2"><Input value={location} placeholder="Ravi's place" onChange={(e) => setLocation(e.target.value)} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea value={notes} placeholder="Blinds, house rules, who brought snacks" onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button disabled={!dirty} loading={busy} onClick={() => run((api) => api.updateSession(s.id, {
          played_on: date, location: location.trim() || null, notes: notes.trim() || null, default_buy_in_cents: parseMoney(buyIn) ?? 0,
        }), 'Details saved')}>Save details</Button>
      </div>
    </Card>
  );
}
