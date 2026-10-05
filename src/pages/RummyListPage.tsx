import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Spade } from 'lucide-react';
import { useAuth } from '../app/auth';
import { formatDate, formatMoney } from '../lib/money';
import { rummyPot, rummyStandings } from '../lib/rummy';
import { useData } from '../app/data';
import { shortName } from '../lib/ledger';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, useShowMore } from '../components/ui';
import { NewRummyGameDialog } from '../components/dialogs/NewRummyGameDialog';

export function RummyListPage() {
  const { api } = useAuth();
  const currency = useData().me.default_currency || 'USD';
  const [newGame, setNewGame] = useState(false);
  const q = useQuery({ queryKey: ['rummy-list', null], queryFn: () => api.loadRummyGames(null) });
  const list = useShowMore(q.data ?? []);

  return (
    <>
      <PageHeader title="Rummy scores" subtitle="Track points across a game, independent of any group."
        actions={<Button variant="primary" onClick={() => setNewGame(true)}><Plus size={16} aria-hidden="true" />New rummy game</Button>} />
      {q.isLoading ? <Spinner /> : q.isError ? (
        <Card className="p-8 text-center">
          <p className="font-display text-lg font-medium">Couldn't load your rummy games</p>
          <p className="mt-2 text-sm text-ink-2">{q.error instanceof Error ? q.error.message : 'Check your connection and try again.'}</p>
          <Button className="mt-4" onClick={() => q.refetch()}>Try again</Button>
        </Card>
      ) : (
        <Card>
          {!q.data || q.data.length === 0 ? (
            <EmptyState icon={<Spade size={28} />} title="No rummy games yet" body="Start one, add friends or players by name, and track points hand by hand."
              action={<Button variant="primary" onClick={() => setNewGame(true)}>New rummy game</Button>} />
          ) : (
            <div className="mt-2">
              {list.visible.map((g) => {
                const leader = rummyStandings(g)[0];
                return (
                  <Link key={g.id} to={`/rummy/${g.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-2/60 md:px-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Spade size={18} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{g.name || 'Rummy'}</p>
                      <p className="truncate text-[12px] text-ink-2">{g.players.length} players, out at {g.point_limit}{g.buy_in_cents > 0 ? `, ${formatMoney(rummyPot(g), currency)} pot` : ''}, {formatDate(g.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={g.status === 'active' ? 'felt' : 'neutral'}>{g.status === 'active' ? 'Active' : 'Finished'}</Badge>
                      {leader && <p className="mt-1 text-[12px] text-ink-2">{shortName(leader.player.name, g.players.map((x) => x.name))} leads</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {list.more}
        </Card>
      )}
      <NewRummyGameDialog open={newGame} onClose={() => setNewGame(false)} />
    </>
  );
}
