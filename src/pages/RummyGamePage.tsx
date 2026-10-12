import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Coins, Lock, Pencil, RotateCcw, Share2, Spade, Trash2, Trophy } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { rummyCanRejoin, rummyPaid, rummyPot, rummyResult, rummyStandings, type RummyResult } from '../lib/rummy';
import { isGameHost, memberName, rummyBalanceRows, rummyTableData, shortName } from '../lib/ledger';
import { shareSummaryImage } from '../lib/summaryImage';
import { useToast } from '../app/toast';
import { Payments } from './GameDayPage';
import { formatDate, formatMoney } from '../lib/money';
import { AvatarButton, BackLink, enterToNext, Badge, Button, Card, CardHeader, Input, PageHeader, Row, Spinner } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberCardDialog } from '../components/dialogs/MemberCardDialog';
import type { Group, RummyGame, RummyPlayer } from '../lib/types';

export function RummyGamePage() {
  const { id } = useParams();
  const { me, groups } = useData();
  const { api } = useAuth();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [cardPlayer, setCardPlayer] = useState<RummyPlayer | null>(null);
  const [rejoining, setRejoining] = useState<RummyPlayer | null>(null);
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  const toast = useToast();

  const q = useQuery({ queryKey: ['rummy', id], queryFn: () => api.loadRummyGame(id!), enabled: !!id });

  if (!id) return <Navigate to="/groups" replace />;
  if (q.isLoading) return <Spinner />;
  if (q.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-lg font-medium">Couldn't load this game</p>
        <p className="mt-2 text-sm text-ink-2">{q.error instanceof Error ? q.error.message : 'Check your connection and try again.'}</p>
        <Button className="mt-4" onClick={() => q.refetch()}>Try again</Button>
      </Card>
    );
  }
  const game = q.data;
  if (!game) return <Navigate to="/groups" replace />;

  const group = game.group_id ? groups.find((g) => g.id === game.group_id) : null;
  const standings = rummyStandings(game);
  const active = standings.filter((s) => !s.eliminated);
  const isScorer = game.scorer_id === me.id;
  const allNames = game.players.map((p) => p.name);
  const short = (name: string) => shortName(name, allNames);
  // Column headers in the rounds table: first names, unless two players share one.
  const firstName = (name: string) => name.trim().split(/\s+/)[0]!;
  const colName = (name: string) => (allNames.filter((n) => firstName(n) === firstName(name)).length > 1 ? short(name) : firstName(name));
  const winner = game.winner_player_id ? game.players.find((p) => p.id === game.winner_player_id) : null;
  const currency = group?.currency ?? (me.default_currency || 'USD');
  const money = (c: number) => formatMoney(c, currency);
  const staked = game.buy_in_cents > 0;
  const canRejoin = isScorer && rummyCanRejoin(game, standings);
  const topActive = active.length ? Math.max(...active.map((x) => x.total)) : 0;
  const result = rummyResult(game);

  const editingRound = editingRoundId ? game.rounds.find((r) => r.id === editingRoundId) ?? null : null;
  const panelPlayers = editingRound
    ? editingRound.scores.map((s) => game.players.find((p) => p.id === s.player_id)).filter((p): p is (typeof game.players)[number] => !!p)
    : active.map((s) => s.player);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rummy', id] });
    qc.invalidateQueries({ queryKey: ['rummy-list'] });
  };

  const startEdit = (round: NonNullable<typeof editingRound>) => {
    const vals: Record<string, string> = {};
    round.scores.forEach((s) => { vals[s.player_id] = String(s.points); });
    setInputs(vals);
    setEditingRoundId(round.id);
    setRoundError(null);
  };

  const cancelEdit = () => { setEditingRoundId(null); setInputs({}); setRoundError(null); };

  const scoresFromInputs = () => panelPlayers.map((p) => ({ playerId: p.id, points: Math.max(0, Number(inputs[p.id]) || 0) }));
  // A new round saves straight away; changing a saved one asks first (SPEC RUMMY-12).
  const saveRound = async () => {
    const scores = scoresFromInputs();
    if (scores.every((s) => s.points === 0)) {
      setRoundError("Everyone can't stay at 0 — enter points for the hand's losers first.");
      return;
    }
    if (editingRound) { setConfirmingEdit(true); return; }
    await commitRound();
  };
  const commitRound = async () => {
    setConfirmingEdit(false);
    const scores = scoresFromInputs();
    const ok = editingRound
      ? await run((api) => api.updateRummyRound(editingRound.id, scores), 'Round updated')
      : await run((api) => api.addRummyRound(game.id, scores), 'Round added');
    if (ok) { setInputs({}); setEditingRoundId(null); setRoundError(null); refresh(); }
  };

  return (
    <>
      <PageHeader
        back={<BackLink to={group ? `/groups/${group.id}` : '/groups'} label={group ? group.name : 'Groups'} />}
        title={game.name || 'Rummy'}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {game.status === 'active' ? <Badge tone="brass">In progress</Badge> : <Badge tone="gain"><Lock size={12} aria-hidden="true" />Final</Badge>}
          <span>Out at {game.point_limit} points</span>
          <span>{game.players.length} players</span>
          {staked && <span>{money(game.buy_in_cents)} buy-in · pot {money(rummyPot(game))}</span>}
        </span>}
        actions={game.status === 'active' && isScorer ? (
          <Button variant="danger" onClick={() => setConfirmingClose(true)}>Close game</Button>
        ) : isScorer ? (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete</Button>
        ) : undefined}
      />

      {game.status === 'finished' && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-brass/40 bg-brass/10 px-3 py-2 text-brass">
          <Trophy size={20} aria-hidden="true" />
          <p className="text-sm font-semibold">
            {winner ? `${winner.name} wins${result ? ` ${money(result.pot)}` : ''}!`
              : result ? `Closed early: pot split between ${result.takers.map((p) => short(p.name)).join(', ')}.` : 'Game closed with no declared winner.'}
          </p>
        </div>
      )}
      {!isScorer && game.status === 'active' && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-ink-2">
          <Lock size={14} aria-hidden="true" />Only the person who started this game can add rounds or close it. You can watch the scores update here.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Standings" action={group && (
            <Button size="sm" onClick={() => shareSummaryImage(rummyTableData(game, group), (pid) => memberName(group, pid))
              .catch((e) => toast.push(e instanceof Error ? e.message : "Couldn't share the image", 'error'))}>
              <Share2 size={14} aria-hidden="true" />Share
            </Button>)} />
          <div className="mt-2">
            {standings.map((s, i) => (
              <Row key={s.player.id} className={clsx('py-2.5', s.eliminated && 'bg-loss/5')}>
                <span className="amount w-4 text-center text-[13px] text-ink-2">{i + 1}</span>
                <AvatarButton name={s.player.name} src={s.player.avatar_url} size={30} onClick={() => setCardPlayer(s.player)} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{short(s.player.name)}{s.player.user_id === me.id && <span className="font-normal text-ink-2"> (you)</span>}</p>
                {s.player.rejoins > 0 && <Badge tone="brass">↺{s.player.rejoins}</Badge>}
                {s.eliminated && (canRejoin
                  ? <Button size="sm" onClick={() => setRejoining(s.player)}><RotateCcw size={14} aria-hidden="true" />Rejoin</Button>
                  : <Badge tone="loss">Out</Badge>)}
                <span className={clsx('amount w-10 text-right font-display text-base font-medium', s.eliminated && 'text-loss')}>{s.total}</span>
              </Row>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          {isScorer && (game.status === 'active' || editingRound) && (
            <Card className={clsx('p-3 md:p-5', editingRound && 'border-2 border-brass bg-brass/5')}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-base font-medium">{editingRound ? `Editing round ${editingRound.round_no}` : `Add round ${game.rounds.length + 1}`}</h2>
                {editingRound && <button type="button" className="text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={cancelEdit}>Cancel</button>}
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {panelPlayers.map((p) => (
                  <label key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-line py-1 pl-2.5 pr-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{short(p.name)}</span>
                    <div className="w-14 shrink-0">
                      <Input inputMode="numeric" aria-label={`${p.name} points`} className="h-9 px-2 text-right" placeholder="0"
                        data-entry="rummy" enterKeyHint="next" onKeyDown={enterToNext}
                        value={inputs[p.id] ?? ''} onChange={(e) => { setInputs((v) => ({ ...v, [p.id]: e.target.value.replace(/\D/g, '') })); setRoundError(null); }} />
                    </div>
                  </label>
                ))}
              </div>
              {roundError && <p className="mt-2 text-[13px] text-loss">{roundError}</p>}
              <p className="mt-2 text-[12px] text-ink-2">Leave the hand's winner at 0. Anyone who reaches {game.point_limit} is marked out.</p>
              <div className="mt-3 flex justify-end">
                <Button variant="primary" loading={busy} onClick={saveRound}>{editingRound ? 'Save changes' : 'Save round'}</Button>
              </div>
            </Card>
          )}

          {result && <Payout game={game} group={group ?? null} result={result} isScorer={isScorer} money={money} short={short} onPosted={refresh} />}

          <Card>
            <CardHeader title="Round by round" />
            {game.rounds.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-2">No rounds recorded yet.</p>
            ) : (
              <div className="pb-3">
                {/* Scrolls inside the card if there are more players than fit, never the page. */}
                <div className="overflow-x-auto px-2 md:px-3">
                  <table className="amount w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-[11px] font-semibold text-ink-2">
                        <th className="w-8 px-1.5 py-1.5 text-left font-semibold">#</th>
                        {game.players.map((p) => (
                          <th key={p.id} title={p.name} className="max-w-[4.5rem] truncate px-1.5 py-1.5 text-right font-semibold">{colName(p.name)}</th>
                        ))}
                        {isScorer && <th className="w-10" aria-label="Edit" />}
                      </tr>
                    </thead>
                    <tbody>
                      {game.rounds.map((r) => (
                        <tr key={r.id} className={clsx('border-t border-line', editingRoundId === r.id && 'bg-brass/15')}>
                          <td className="px-1.5 py-1.5 text-[12px] text-ink-2">{r.round_no}</td>
                          {game.players.map((p) => {
                            const sc = r.scores.find((x) => x.player_id === p.id);
                            return <td key={p.id} className={clsx('px-1.5 py-1.5 text-right', !sc && 'text-ink-2/50')}>{sc ? sc.points : '–'}</td>;
                          })}
                          {isScorer && (
                            <td className="px-1 py-1 text-right">
                              <button type="button" aria-label={`Edit round ${r.round_no}`} onClick={() => startEdit(r)} disabled={editingRoundId === r.id}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40">
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-line font-semibold">
                        <td className="px-1.5 py-1.5 text-[12px] text-ink-2">Total</td>
                        {game.players.map((p) => {
                          const st = standings.find((x) => x.player.id === p.id);
                          return <td key={p.id} className={clsx('px-1.5 py-1.5 text-right', st?.eliminated && 'text-loss')}>{st?.total ?? 0}</td>;
                        })}
                        {isScorer && <td />}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 px-4 text-[11px] text-ink-2 md:px-5">
                  {isScorer ? 'Use ✎ to fix a round; you\'ll confirm before it changes. ' : ''}Started {formatDate(game.created_at)}{game.finished_at ? `, finished ${formatDate(game.finished_at)}` : ''}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <MemberCardDialog member={cardPlayer} onClose={() => setCardPlayer(null)}
        extra={cardPlayer ? { label: 'Points this game', node: <span className="amount font-display text-base font-medium">{standings.find((x) => x.player.id === cardPlayer.id)?.total ?? 0}</span> } : undefined} />
      <ConfirmDialog open={!!rejoining} onClose={() => setRejoining(null)} title={`Bring ${rejoining ? short(rejoining.name) : ''} back in?`} tone="primary" icon={RotateCcw} busy={busy}
        confirmLabel="Rejoin"
        body={rejoining && <>They restart at <b>{topActive}</b> points, the highest score still in.{staked && <> That's another <b>{money(game.buy_in_cents)}</b> buy-in, so they'll have put in <b>{money(rummyPaid(game, rejoining) + game.buy_in_cents)}</b>.</>}</>}
        onConfirm={async () => { const pid = rejoining!.id; setRejoining(null); const ok = await run((api) => api.rejoinRummyPlayer(pid), 'Back in the game'); if (ok) refresh(); }} />
      <ConfirmDialog open={confirmingEdit} onClose={() => setConfirmingEdit(false)} title={`Change round ${editingRound?.round_no ?? ''}?`} tone="primary" icon={Pencil} busy={busy}
        confirmLabel="Save changes"
        body={editingRound && <>
          {(() => {
            const changes = editingRound.scores.map((s) => ({ s, now: Math.max(0, Number(inputs[s.player_id]) || 0) })).filter(({ s, now }) => now !== s.points);
            return changes.length === 0 ? 'No scores changed.' : <>{changes.map(({ s, now }) => (
              <span key={s.player_id} className="block"><b>{short(game.players.find((p) => p.id === s.player_id)?.name ?? '')}</b>: {s.points} → <b>{now}</b></span>
            ))}<span className="mt-2 block">Totals and who's out are worked out again from this.</span></>;
          })()}
        </>}
        onConfirm={commitRound} />
      <ConfirmDialog open={confirmingClose} onClose={() => setConfirmingClose(false)} title="Close this rummy game?" tone="primary" icon={Spade} busy={busy}
        confirmLabel="Close game"
        body={staked ? 'This ends the game now. If one player is still in, they win the pot; otherwise the pot is split evenly between everyone still in.' : 'This ends the game now. A winner is only declared if exactly one player is still under the point limit — otherwise it just closes with no winner.'}
        onConfirm={async () => { setConfirmingClose(false); const ok = await run((api) => api.closeRummyGame(game.id), 'Game closed'); if (ok) refresh(); }} />

      <ConfirmDialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} title="Delete this rummy game?" icon={Trash2} busy={busy}
        body="This permanently removes the game and every round's scores. This can't be undone."
        onConfirm={async () => {
          setConfirmingDelete(false);
          const ok = await run((api) => api.deleteRummyGame(game.id), 'Rummy game deleted');
          if (ok) { qc.invalidateQueries({ queryKey: ['rummy-list'] }); nav(group ? `/groups/${group.id}` : '/groups'); }
        }} />
    </>
  );
}

/** Money after a staked game ends (SPEC RUMMY-10, RUMMY-11). On the scorer's screen the payout
 *  goes into the group's balances by itself, as a finished game; from then on it's the same
 *  Settle up card as a poker game: Mark paid, Undo, reminders, Share. */
function Payout({ game, group, result, isScorer, money, short, onPosted }: {
  game: RummyGame; group: Group | null; result: RummyResult; isScorer: boolean;
  money(c: number): string; short(n: string): string; onPosted(): void;
}) {
  const { run } = useAction();
  const { me } = useData();
  const rows = group ? rummyBalanceRows(game, group) : null;
  const posting = useRef(false);
  useEffect(() => {
    if (!isScorer || !group || !rows || game.session_id || posting.current) return;
    posting.current = true; // once per screen, even if React runs this twice
    void run((api) => api.postRummyPayout(game.id, rows), 'Added to group balances').then((ok) => { if (ok) onPosted(); else posting.current = false; });
  }, [isScorer, group, rows, game.session_id, game.id, run, onPosted]);

  const session = group && game.session_id ? group.sessions.find((x) => x.id === game.session_id) : null;
  if (group && session) return <Payments g={group} s={session} host={isGameHost(group, session, me.id)} />;

  const name = (id: string) => short(game.players.find((p) => p.id === id)?.name ?? 'Someone');
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Coins size={16} className="text-brass" aria-hidden="true" />Payout</span>}
        action={<span className="text-[13px] text-ink-2">Pot {money(result.pot)}</span>} />
      <div className="mt-1">
        {result.transfers.length === 0 ? <p className="px-4 pb-3 text-sm text-ink-2 md:px-5">Everyone broke even.</p> : result.transfers.map((t) => (
          <Row key={`${t.from}-${t.to}`} className="py-2">
            <p className="min-w-0 flex-1 truncate text-sm">
              <b className="font-semibold text-loss">{name(t.from)}</b>
              <ArrowRight size={14} className="mx-1 inline text-ink-2" aria-label="pays" />
              <b className="font-semibold text-gain">{name(t.to)}</b>
            </p>
            <span className="amount font-display text-base font-medium">{money(t.cents)}</span>
          </Row>
        ))}
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-2 md:px-5">
        {!group ? 'Settle these payments directly.'
          : !rows ? `Some players aren't in ${group.name} by these names, so this can't go into its balances. Settle these payments directly.`
            : isScorer ? `Adding this to ${group.name}'s balances…` : `This goes into ${group.name}'s balances once the scorer opens the game.`}
      </p>
    </Card>
  );
}
