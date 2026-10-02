import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Spade, Trash2, Trophy } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { rummyStandings } from '../lib/rummy';
import { formatDate } from '../lib/money';
import { Avatar, BackLink, Badge, Button, Card, CardHeader, Input, PageHeader, Row, Spinner } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

  const q = useQuery({ queryKey: ['rummy', id], queryFn: () => api.loadRummyGame(id!), enabled: !!id });

  if (!id) return <Navigate to="/rummy" replace />;
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
  if (!game) return <Navigate to="/rummy" replace />;

  const group = game.group_id ? groups.find((g) => g.id === game.group_id) : null;
  const standings = rummyStandings(game);
  const active = standings.filter((s) => !s.eliminated);
  const isScorer = game.scorer_id === me.id;
  const winner = game.winner_player_id ? game.players.find((p) => p.id === game.winner_player_id) : null;

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

  const saveRound = async () => {
    const scores = panelPlayers.map((p) => ({ playerId: p.id, points: Math.max(0, Number(inputs[p.id]) || 0) }));
    if (scores.every((s) => s.points === 0)) {
      setRoundError("Everyone can't stay at 0 — enter points for the hand's losers first.");
      return;
    }
    const ok = editingRound
      ? await run((api) => api.updateRummyRound(editingRound.id, scores), 'Round updated')
      : await run((api) => api.addRummyRound(game.id, scores), 'Round added');
    if (ok) { setInputs({}); setEditingRoundId(null); setRoundError(null); refresh(); }
  };

  return (
    <>
      <PageHeader
        back={<BackLink to={group ? `/groups/${group.id}?tab=rummy` : '/rummy'} label={group ? group.name : 'Rummy'} />}
        title={game.name || 'Rummy'}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={game.status === 'active' ? 'felt' : 'neutral'}>{game.status === 'active' ? 'Active' : 'Finished'}</Badge>
          <span>Out at {game.point_limit} points</span>
          <span>{game.players.length} players</span>
        </span>}
        actions={game.status === 'active' && isScorer ? (
          <Button variant="danger" onClick={() => setConfirmingClose(true)}>Close game</Button>
        ) : isScorer ? (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete</Button>
        ) : undefined}
      />

      {game.status === 'finished' && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brass/40 bg-brass/10 px-4 py-3 text-brass">
          <Trophy size={20} aria-hidden="true" />
          <p className="text-sm font-semibold">{winner ? `${winner.name} wins!` : 'Game closed with no declared winner.'}</p>
        </div>
      )}
      {!isScorer && game.status === 'active' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2/60 px-4 py-2.5 text-[13px] text-ink-2">
          <Lock size={14} aria-hidden="true" />Only the person who started this game can add rounds or close it. You can watch the scores update here.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Standings" />
          <div className="mt-2">
            {standings.map((s, i) => (
              <Row key={s.player.id} className={s.eliminated ? 'bg-loss/5' : undefined}>
                <span className="amount w-5 text-center text-sm text-ink-2">{i + 1}</span>
                <Avatar name={s.player.name} src={s.player.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.player.name}{s.player.user_id === me.id && <span className="font-normal text-ink-2"> (you)</span>}</p>
                  {s.eliminated && <p className="text-[12px] font-semibold text-loss">Out</p>}
                </div>
                <span className={`amount font-display text-lg font-medium ${s.eliminated ? 'text-loss' : ''}`}>{s.total}</span>
              </Row>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          {isScorer && (game.status === 'active' || editingRound) && (
            <Card className="p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-medium">{editingRound ? `Edit round ${editingRound.round_no}` : `Add round ${game.rounds.length + 1}`}</h2>
                {editingRound && <button type="button" className="text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={cancelEdit}>Cancel</button>}
              </div>
              <div className="space-y-2">
                {panelPlayers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} src={p.avatar_url} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                    <div className="w-20 shrink-0">
                      <Input inputMode="numeric" className="text-right" placeholder="0"
                        value={inputs[p.id] ?? ''} onChange={(e) => { setInputs((v) => ({ ...v, [p.id]: e.target.value.replace(/\D/g, '') })); setRoundError(null); }} />
                    </div>
                  </div>
                ))}
              </div>
              {roundError && <p className="mt-2 text-[13px] text-loss">{roundError}</p>}
              <p className="mt-2 text-[12px] text-ink-2">Leave the hand's winner at 0. Anyone who reaches {game.point_limit} is marked out.</p>
              <div className="mt-3 flex justify-end">
                <Button variant="primary" loading={busy} onClick={saveRound}>{editingRound ? 'Save changes' : 'Save round'}</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Round by round" />
            {game.rounds.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-2">No rounds recorded yet.</p>
            ) : (
              <div className="space-y-2 px-4 pb-4 md:px-5">
                {game.rounds.map((r) => (
                  <div key={r.id}
                    className={isScorer
                      ? `cursor-pointer rounded-xl border p-3 hover:bg-surface-2/60 ${editingRoundId === r.id ? 'border-felt bg-felt/10' : 'border-line'}`
                      : 'rounded-xl border border-line p-3'}
                    onClick={isScorer ? () => startEdit(r) : undefined}>
                    <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Round {r.round_no}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                      {r.scores.map((s) => {
                        const p = game.players.find((x) => x.id === s.player_id);
                        if (!p) return null;
                        return (
                          <div key={s.player_id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-ink-2">{p.name}</span>
                            <span className="amount font-semibold">{s.points}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {isScorer && <p className="mt-1 text-[11px] text-ink-2">Tap a round to fix its scores.</p>}
                <p className="mt-1 text-[11px] text-ink-2">Started {formatDate(game.created_at)}{game.finished_at ? `, finished ${formatDate(game.finished_at)}` : ''}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog open={confirmingClose} onClose={() => setConfirmingClose(false)} title="Close this rummy game?" tone="primary" icon={Spade} busy={busy}
        confirmLabel="Close game"
        body="This ends the game now. A winner is only declared if exactly one player is still under the point limit — otherwise it just closes with no winner."
        onConfirm={async () => { setConfirmingClose(false); const ok = await run((api) => api.closeRummyGame(game.id), 'Game closed'); if (ok) refresh(); }} />

      <ConfirmDialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} title="Delete this rummy game?" icon={Trash2} busy={busy}
        body="This permanently removes the game and every round's scores. This can't be undone."
        onConfirm={async () => {
          setConfirmingDelete(false);
          const ok = await run((api) => api.deleteRummyGame(game.id), 'Rummy game deleted');
          if (ok) { qc.invalidateQueries({ queryKey: ['rummy-list'] }); nav(group ? `/groups/${group.id}?tab=rummy` : '/rummy'); }
        }} />
    </>
  );
}
