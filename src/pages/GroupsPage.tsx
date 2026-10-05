import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Plus, Spade, Receipt, Users } from 'lucide-react';
import { useData } from '../app/data';
import { groupBalances, listedGroups, myMemberId, sessionPayments } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Badge, Button, Card, EmptyState, PageHeader, Tabs, useShowMore } from '../components/ui';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';
import type { GroupKind } from '../lib/types';

export const KIND_LABEL: Record<GroupKind, string> = { club: 'Club', expenses: 'Expenses' };

type Filter = 'all' | 'games' | 'expenses';
const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'games', label: 'Clubs' }, { value: 'expenses', label: 'Trips & expenses' }];

export function GroupIcon({ kind, size = 40 }: { kind: GroupKind; size?: number }) {
  const Icon = kind === 'club' ? Spade : Receipt;
  return (
    <span style={{ width: size, height: size }}
      className={kind === 'club' ? 'felt inline-flex shrink-0 items-center justify-center rounded-xl' : 'inline-flex shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink'}>
      <Icon size={size * 0.5} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

export function GroupsPage() {
  const data = useData();
  const { me } = data;
  const groups = listedGroups(data);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const myBal = (g: (typeof groups)[number]) => { const mine = myMemberId(g, me.id); return mine ? groupBalances(g).get(mine) ?? 0 : 0; };
  // Biggest balance first, whether you're owed or you owe; settled groups last.
  const shown = groups.filter((g) => filter === 'all' || (filter === 'games' ? g.kind === 'club' : g.kind === 'expenses'))
    .sort((a, b) => Math.abs(myBal(b)) - Math.abs(myBal(a)) || a.name.localeCompare(b.name));
  const list = useShowMore(shown, 6);

  return (
    <>
      <PageHeader title="Groups" subtitle="Clubs for recurring games, groups for trips and shared expenses."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} aria-hidden="true" />New group</Button>} />
      {groups.length === 0 ? (
        <Card><EmptyState icon={<Users size={28} />} title="Start your first group" body="A club for your regular card night, a trip, your apartment. Add the people, then log as you go."
          action={<Button variant="primary" onClick={() => setOpen(true)}>Create group</Button>} /></Card>
      ) : (
        <>
          <div className="mb-4"><Tabs<Filter> tabs={FILTERS} value={filter} onChange={setFilter} /></div>
          {shown.length === 0 ? (
            <Card><EmptyState icon={<Users size={28} />} title="No groups here" body="Nothing matches this filter yet." /></Card>
          ) : (
            <div className="space-y-3">
              {list.visible.map((g) => {
                const mine = myMemberId(g, me.id);
                const bal = mine ? groupBalances(g).get(mine) ?? 0 : 0;
                const finals = g.sessions.filter((s) => s.status === 'final');
                const live = g.sessions.some((s) => s.status === 'open');
                const unpaid = finals.reduce((a, s) => a + sessionPayments(g, s).filter((p) => !p.settlementId).length, 0);
                const dates = g.kind === 'club' ? g.sessions.map((s) => s.played_on) : g.expenses.map((e) => e.spent_on);
                const lastDate = dates.sort()[dates.length - 1];
                const counts = [
                  `${g.members.length} people`,
                  g.kind === 'club' ? `${finals.length} game${finals.length === 1 ? '' : 's'}` : `${g.expenses.length} expense${g.expenses.length === 1 ? '' : 's'}`,
                ].join(' · ');
                return (
                  <Link key={g.id} to={`/groups/${g.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 transition-colors hover:border-ink/20 md:px-5">
                    <GroupIcon kind={g.kind} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">{g.name}</p>
                      <p className="truncate text-[13px] text-ink-2">{counts}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                        {lastDate && <span>Last {g.kind === 'club' ? 'game' : 'expense'} {formatDate(lastDate, { month: 'short', day: 'numeric' })}</span>}
                        {live && <Badge tone="brass">Game in progress</Badge>}
                        {unpaid > 0 && <Badge tone="loss">{unpaid} unpaid</Badge>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] text-ink-2">{bal > 0 ? 'You get' : bal < 0 ? 'You pay' : 'Settled'}</p>
                      {bal !== 0 && <p className={clsx('amount font-display text-lg font-semibold', bal > 0 ? 'text-gain' : 'text-loss')}>{formatMoney(Math.abs(bal), g.currency)}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {list.hasMore && <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface [&>div]:border-t-0">{list.more}</div>}
        </>
      )}
      <CreateGroupDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
