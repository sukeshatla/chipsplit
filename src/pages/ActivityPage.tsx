import { Link } from 'react-router-dom';
import { Receipt, Spade, HandCoins } from 'lucide-react';
import { useData } from '../app/data';
import { activity } from '../lib/ledger';
import { formatDate } from '../lib/money';
import { Amount, BackLink, Card, EmptyState, PageHeader, Row } from '../components/ui';

const ACTIVITY_ICON = { expense: Receipt, game: Spade, payment: HandCoins };

export function ActivityPage() {
  const data = useData();
  const feed = activity(data, 200);

  return (
    <>
      <PageHeader back={<BackLink to="/" label="Dashboard" />} title="Activity" subtitle="Every game, expense, and payment across your groups." />
      <Card>
        {feed.length === 0 ? (
          <EmptyState icon={<Receipt size={28} />} title="Nothing logged yet" body="Games, expenses, and payments show up here." />
        ) : feed.map((a) => {
          const Icon = ACTIVITY_ICON[a.kind];
          return (
            <Link key={a.id} to={a.link} className="block">
              <Row className="hover:bg-surface-2/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Icon size={16} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.title}</p>
                  <p className="truncate text-[12px] text-ink-2">{a.group.name}, {a.detail}, {formatDate(a.date, { month: 'short', day: 'numeric' })}</p>
                </div>
                {a.impact !== null ? <Amount cents={a.impact} currency={a.group.currency} sign /> : <span className="text-right text-[12px] text-ink-2">{a.note ?? 'not involved'}</span>}
              </Row>
            </Link>
          );
        })}
      </Card>
    </>
  );
}
