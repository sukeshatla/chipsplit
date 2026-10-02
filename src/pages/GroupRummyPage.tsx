import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Spade } from 'lucide-react';
import { useData } from '../app/data';
import { useAuth } from '../app/auth';
import { shortName } from '../lib/ledger';
import { rummyStandings } from '../lib/rummy';
import { formatDate } from '../lib/money';
import { BackLink, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Row, Spinner } from '../components/ui';
import { NewRummyGameDialog } from '../components/dialogs/NewRummyGameDialog';
import type { Group } from '../lib/types';

/** A club's rummy games, opened from the "Rummy" button on the club page. */
export function GroupRummyPage() {
  const { groupId } = useParams();
  const { groups } = useData();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return <Navigate to="/groups" replace />;
  return (
    <>
      <PageHeader back={<BackLink to={`/groups/${g.id}`} label={g.name} />} title="Rummy" subtitle="Points hand by hand; cross the limit and you're out." />
      <RummyList g={g} />
    </>
  );
}

function RummyList({ g }: { g: Group }) {
  const { api } = useAuth();
  const [newGame, setNewGame] = useState(false);
  const q = useQuery({ queryKey: ['rummy-list', g.id], queryFn: () => api.loadRummyGames(g.id) });

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
                  {leader && <span className="hidden text-[12px] text-ink-2 sm:inline">{shortName(leader.player.name, rg.players.map((x) => x.name))} leads</span>}
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

