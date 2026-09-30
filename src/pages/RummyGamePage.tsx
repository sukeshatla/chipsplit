import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Spade, Trash2, Trophy } from 'lucide-react';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { rummyStandings } from '../lib/rummy';
import { formatDate } from '../lib/money';
import { Avatar, Badge, Button, Card, CardHeader, Input, PageHeader, Row, Spinner } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function RummyGamePage() {
  const { id } = useParams();
  const { me, groups } = useData();
  const { api } = useAuth();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const q = useQuery({ queryKey: ['rummy', id], queryFn: () => api.loadRummyGame(id!), enabled: !!id });

  if (!id) return <Navigate to="/rummy" replace />;
  if (q.isLoading) return <Spinner />;
  const game = q.data;
  if (!game) return <Navigate to="/rummy" replace />;

  const group = game.group_id ? groups.find((g) => g.id === game.group_id) : null;
  const standings = rummyStandings(game);
  const active = standings.filter((s) => !s.eliminated);
  const isScorer = game.scorer_id === me.id;
  const winner = game.winner_player_id ? game.players.find((p) => p.id === game.winner_player_id) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rummy', id] });
    qc.invalidateQueries({ queryKey: ['rummy-list'] });
  };

  const addRound = async () => {
    const scores = active.map((s) => ({ playerId: s.player.id, points: Math.max(0, Number(inputs[s.player.id]) || 0) }));
    const ok = await run((api) => api.addRummyRound(game.id, scores), 'Round added');
    if (ok) { setInputs({}); refresh(); }
  };

  return (
    <>
      <PageHeader
        back={
          <Link to={group ? `/groups/${group.id}?tab=rummy` : '/rummy'} className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink">
            <ArrowLeft size={14} aria-hidden="true" />{group ? group.name : 'Rummy'}
          </Link>
        }
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
          {isScorer && game.status === 'active' && (
            <Card className="p-4 md:p-5">
              <h2 className="mb-3 font-display text-base font-medium">Add round {game.rounds.length + 1}</h2>
              <div className="space-y-2">
                {active.map((s) => (
                  <div key={s.player.id} className="flex items-center gap-3">
                    <Avatar name={s.player.name} src={s.player.avatar_url} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.player.name}</span>
                    <Input inputMode="numeric" className="w-20 text-right" placeholder="0"
                      value={inputs[s.player.id] ?? ''} onChange={(e) => setInputs((v) => ({ ...v, [s.player.id]: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-2">Leave the hand's winner at 0. Anyone who reaches {game.point_limit} is marked out.</p>
              <div className="mt-3 flex justify-end">
                <Button variant="primary" loading={busy} onClick={addRound}>Save round</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Round by round" />
            {game.rounds.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-2">No rounds recorded yet.</p>
            ) : (
              <div className="overflow-x-auto px-4 pb-4 md:px-5">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="text-[12px] text-ink-2">
                      <th className="py-1.5 pr-2 text-left font-semibold">Round</th>
                      {game.players.map((p) => <th key={p.id} className="py-1.5 px-2 text-right font-semibold">{p.name.split(' ')[0]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {game.rounds.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-1.5 pr-2 text-ink-2">{r.round_no}</td>
                        {game.players.map((p) => {
                          const s = r.scores.find((x) => x.player_id === p.id);
                          return <td key={p.id} className="amount py-1.5 px-2 text-right">{s ? s.points : '—'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-ink-2">Started {formatDate(game.created_at)}{game.finished_at ? `, finished ${formatDate(game.finished_at)}` : ''}</p>
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
