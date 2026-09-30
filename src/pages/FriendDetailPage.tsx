import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, HandCoins } from 'lucide-react';
import { useData } from '../app/data';
import { friendBalances } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Avatar, BalanceText, Button, Card, CardHeader, Row } from '../components/ui';
import { GroupIcon } from './GroupsPage';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import type { Group } from '../lib/types';

export function FriendDetailPage() {
  const { key } = useParams();
  const data = useData();
  const f = friendBalances(data).find((x) => x.key === decodeURIComponent(key ?? ''));
  const [settle, setSettle] = useState<{ group: Group; draft: SettleDraft } | null>(null);
  if (!f) return <Navigate to="/friends" replace />;
  const currency = data.me.default_currency || 'USD';

  return (
    <>
      <Link to="/friends" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={14} aria-hidden="true" />Friends</Link>
      <section className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={f.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[28px] font-medium leading-tight">{f.name}</h1>
          <p className="text-sm text-ink-2">{f.email ?? 'Guest, no email yet'}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 px-5 py-3 text-right">
          <p className="text-[13px] text-ink-2">{f.net === 0 ? 'All square' : f.net > 0 ? `${f.name} owes you` : `You owe ${f.name}`}</p>
          <p className={`amount font-display text-3xl font-medium ${f.net > 0 ? 'text-gain' : f.net < 0 ? 'text-loss' : ''}`}>{formatMoney(Math.abs(f.net), currency)}</p>
        </div>
      </section>

      <Card>
        <CardHeader title="By group" />
        <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">Based on each group's simplified payments.</p>
        <div className="mt-2">
          {f.groups.map((fg) => (
            <Row key={fg.group.id}>
              <GroupIcon kind={fg.group.kind} />
              <Link to={`/groups/${fg.group.id}?tab=balances`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">{fg.group.name}</Link>
              <BalanceText cents={fg.cents} currency={fg.group.currency} />
              {fg.cents !== 0 && (
                <Button size="sm" onClick={() => setSettle({
                  group: fg.group,
                  draft: fg.cents > 0
                    ? { from: fg.memberId, to: fg.myMemberId, cents: fg.cents }
                    : { from: fg.myMemberId, to: fg.memberId, cents: -fg.cents },
                })}><HandCoins size={14} aria-hidden="true" />Settle</Button>
              )}
            </Row>
          ))}
        </div>
      </Card>
      {settle && <SettleDialog group={settle.group} draft={settle.draft} onClose={() => setSettle(null)} />}
    </>
  );
}
