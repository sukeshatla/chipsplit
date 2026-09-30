import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, HeartHandshake, ChevronRight } from 'lucide-react';
import { useData } from '../app/data';
import { friendBalances, totals } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Avatar, BalanceText, Card, EmptyState, Input, PageHeader } from '../components/ui';

export function FriendsPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const currency = data.me.default_currency || 'USD';
  const friends = friendBalances(data).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const t = totals(data);

  return (
    <>
      <PageHeader title="Friends" subtitle="What you and each person owe across every group you share." />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-4"><p className="text-[13px] text-ink-2">Owed to you</p><p className="amount font-display text-2xl font-medium text-gain">{formatMoney(t.owed, currency)}</p></div>
        <div className="rounded-2xl bg-surface-2 p-4"><p className="text-[13px] text-ink-2">You owe</p><p className="amount font-display text-2xl font-medium text-loss">{formatMoney(t.owe, currency)}</p></div>
      </div>
      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <Input aria-label="Search friends" className="pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        {friends.length === 0 ? (
          <EmptyState icon={<HeartHandshake size={28} />} title={q ? 'No one by that name' : 'Add friends to a group'}
            body={q ? 'Try a shorter search.' : 'Everyone you share a group with shows up here with your running balance.'} />
        ) : friends.map((f) => (
          <Link key={f.key} to={`/friends/${encodeURIComponent(f.key)}`}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-2/60 md:px-5">
            <Avatar name={f.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{f.name}</p>
              <p className="truncate text-[12px] text-ink-2">{f.groups.length === 1 ? f.groups[0]!.group.name : `${f.groups.length} groups`}</p>
            </div>
            <BalanceText cents={f.net} currency={currency} />
            <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
          </Link>
        ))}
      </Card>
    </>
  );
}
