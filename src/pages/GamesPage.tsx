import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spade, ChevronRight } from 'lucide-react';
import { useData } from '../app/data';
import { myMemberId, pokerStats, sessionPayments } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Badge, Button, Card, EmptyState, PageHeader, Row } from '../components/ui';
import { NewGameDialog } from '../components/dialogs/NewGameDialog';

export function GamesPage() {
  const data = useData();
  const [open, setOpen] = useState(false);
  const stats = pokerStats(data);
  const currency = data.me.default_currency || 'USD';
  const all = data.groups
    .flatMap((g) => g.sessions.map((s) => ({ g, s })))
    .sort((a, b) => (a.s.status === b.s.status ? b.s.played_on.localeCompare(a.s.played_on) : a.s.status === 'open' ? -1 : 1));

  return (
    <>
      <PageHeader title="Game days" subtitle="Every game night across your groups."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Spade size={16} aria-hidden="true" />Start game</Button>} />

      {stats.games > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Your card game total', value: <Amount cents={stats.net} currency={currency} sign className="text-2xl" /> },
            { label: 'Games played', value: <span className="font-display text-2xl font-medium">{stats.games}</span> },
            { label: 'Winning nights', value: <span className="font-display text-2xl font-medium">{stats.winRate}%</span> },
            { label: 'Best night', value: <Amount cents={stats.best} currency={currency} sign className="text-2xl" /> },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl bg-surface-2 p-4">
              <p className="text-[13px] text-ink-2">{x.label}</p>
              <div className="mt-1">{x.value}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        {all.length === 0 ? (
          <EmptyState icon={<Spade size={28} />} title="No game days yet" body="Start one from a Cards group and log buy-ins as people sit down."
            action={<Button variant="primary" onClick={() => setOpen(true)}>Start game</Button>} />
        ) : all.map(({ g, s }) => {
          const mine = myMemberId(g, data.me.id);
          const r = s.results.find((x) => x.member_id === mine);
          const unpaid = s.status === 'final' ? sessionPayments(g, s).filter((p) => !p.settlementId).length : 0;
          return (
            <Link key={s.id} to={`/groups/${g.id}/games/${s.id}`} className="block">
              <Row className="hover:bg-surface-2/60">
                <div className="w-11 shrink-0 text-center">
                  <p className="text-[11px] font-semibold text-ink-2">{formatDate(s.played_on, { month: 'short' })}</p>
                  <p className="font-display text-xl font-medium leading-none">{formatDate(s.played_on, { day: 'numeric' })}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{g.name}{s.location ? `, ${s.location}` : ''}</p>
                  <p className="text-[12px] text-ink-2">{s.results.length} players, {formatMoney(s.results.reduce((a, x) => a + x.buy_in_cents, 0), g.currency)} in play</p>
                </div>
                {s.status === 'open' ? <Badge tone="brass">In progress</Badge>
                  : r ? <Amount cents={r.cash_out_cents - r.buy_in_cents} currency={g.currency} sign />
                    : <span className="text-[12px] text-ink-2">sat out</span>}
                {unpaid > 0 && <Badge tone="loss">{unpaid} unpaid</Badge>}
                <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
              </Row>
            </Link>
          );
        })}
      </Card>
      <NewGameDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
