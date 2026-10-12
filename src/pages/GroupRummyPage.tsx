import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Club } from 'lucide-react';
import { useAuth } from '../app/auth';
import { isSessionSettled, rummyLeaderboard, shortName } from '../lib/ledger';
import { Leaderboard } from '../components/Leaderboard';
import { rummyPot, rummyStandings } from '../lib/rummy';
import { formatDate, formatMoney, localDay } from '../lib/money';
import { Badge, Button, Card, CardHeader, EmptyState, Row, Spinner, useShowMore } from '../components/ui';
import type { Group } from '../lib/types';

/** Old links to a club's rummy page land on the group itself; rummy lives in Rummy groups now. */
export function GroupRummyPage() {
  const { groupId } = useParams();
  return <Navigate to={`/groups/${groupId}`} replace />;
}

/** A Rummy group's Games tab: its rummy games, newest first (SPEC RUMMY-7). */
export function RummyGames({ g, onNew }: { g: Group; onNew(): void }) {
  const { api } = useAuth();
  const q = useQuery({ queryKey: ['rummy-list', g.id], queryFn: () => api.loadRummyGames(g.id) });
  const list = useShowMore(q.data ?? []);

  if (q.isLoading) return <Spinner />;
  if (q.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-lg font-medium">Couldn't load rummy games</p>
        <p className="mt-2 text-sm text-ink-2">{q.error instanceof Error ? q.error.message : 'Check your connection and try again.'}</p>
        <Button className="mt-4" onClick={() => q.refetch()}>Try again</Button>
      </Card>
    );
  }
  const games = q.data ?? [];

  return (<div className="space-y-5">
    <Card>
      <CardHeader title="Rummy games" />
      {games.length === 0 ? (
        <EmptyState icon={<Club size={28} />} title="No rummy games yet" body="Start one and track points hand by hand, with anyone crossing the point limit marked out."
          action={<Button variant="primary" onClick={() => onNew()}>Start a rummy game</Button>} />
      ) : (
        <div className="mt-2">
          {list.visible.map((rg) => {
            const leader = rummyStandings(rg)[0];
            const day = localDay(rg.created_at);
            // Same as a poker game's row (SPEC RUMMY-9): date, name, players and pot, then
            // In progress / Unsettled until its payout is paid / Settled.
            const payout = rg.session_id ? g.sessions.find((x) => x.id === rg.session_id) : undefined;
            const unsettled = rg.buy_in_cents > 0 && (!payout || !isSessionSettled(g, payout));
            return (
              <Link key={rg.id} to={`/rummy/${rg.id}`} className="block">
                <Row className="hover:bg-surface-2/60">
                  <div className="w-11 shrink-0 text-center">
                    <p className="text-[11px] font-semibold text-ink-2">{formatDate(day, { month: 'short' })}</p>
                    <p className="font-display text-xl font-medium leading-none">{formatDate(day, { day: 'numeric' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{rg.name || 'Rummy'}</p>
                    <p className="truncate text-[12px] text-ink-2">
                      {rg.players.length} players{rg.buy_in_cents > 0 ? `, ${formatMoney(rummyPot(rg), g.currency)} pot` : ''}, out at {rg.point_limit}
                      {rg.status === 'active' && leader ? `, ${shortName(leader.player.name, rg.players.map((x) => x.name))} leads` : ''}
                    </p>
                  </div>
                  {rg.status === 'active' ? <Badge tone="brass">In progress</Badge>
                    : unsettled ? <Badge tone="loss">Unsettled</Badge> : <Badge tone="gain">Settled</Badge>}
                  <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
                </Row>
              </Link>
            );
          })}
        </div>
      )}
      {list.more}
    </Card>
    <Leaderboard g={g} rows={rummyLeaderboard(g, games)} />
  </div>);
}

