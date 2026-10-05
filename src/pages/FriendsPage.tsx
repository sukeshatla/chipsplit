import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, HeartHandshake, UserPlus } from 'lucide-react';
import { useData } from '../app/data';
import { friendsList, moneyPhrase, totals, STATUS_LABEL } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Avatar, BalanceText, Button, Card, EmptyState, Input, PageHeader, useShowMore } from '../components/ui';
import { AddFriendDialog } from '../components/dialogs/AddFriendDialog';

export function FriendsPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const currency = data.me.default_currency || 'USD';
  // Biggest amount owed to you first, down to what you owe most.
  const friends = friendsList(data).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const list = useShowMore(friends);
  const t = totals(data);

  return (
    <>
      <PageHeader title="Friends" subtitle="Everyone you split with, in groups or one-on-one."
        actions={<Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={16} aria-hidden="true" />Add friend</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 px-4 py-3"><p className="text-[13px] text-ink-2">Owed to you</p><p className="amount font-display text-xl font-medium md:text-2xl text-gain">{formatMoney(t.owed, currency)}</p></div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3"><p className="text-[13px] text-ink-2">You owe</p><p className="amount font-display text-xl font-medium md:text-2xl text-loss">{formatMoney(t.owe, currency)}</p></div>
      </div>
      {t.others.length > 0 && (
        <p className="-mt-2 mb-4 text-[13px] text-ink-2">
          {t.others.map((m) => <span key={m.currency} className="mr-3 inline-block">In {m.currency}: <b className="amount font-semibold text-ink">{moneyPhrase(m, 'overall')}</b></span>)}
        </p>
      )}
      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <Input aria-label="Search friends" className="pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        {friends.length === 0 ? (
          <EmptyState icon={<HeartHandshake size={28} />} title={q ? 'No one by that name' : 'No friends yet'}
            body={q ? 'Try a shorter search.' : 'Add a friend directly, or add them to a group — either way they show up here.'}
            action={!q && <Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={16} aria-hidden="true" />Add friend</Button>} />
        ) : list.visible.map((f) => (
          <Link key={f.key} to={`/friends/${encodeURIComponent(f.key)}`}
            className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60 md:px-5">
            <Avatar name={f.name} src={f.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{f.name}</p>
              <p className="truncate text-[12px] text-ink-2">
                {STATUS_LABEL[f.status]} · {f.others.length ? `also ${f.others.map((m) => moneyPhrase(m, 'friend')).join(', ')}` : f.groups.length === 0 ? 'nothing shared yet' : `${f.groups.length} shared`}
              </p>
            </div>
            <BalanceText cents={f.net} currency={f.currency} />
          </Link>
        ))}
        {list.more}
      </Card>
      <AddFriendDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
