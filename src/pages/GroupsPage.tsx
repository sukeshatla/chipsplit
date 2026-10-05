import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Spade, Receipt, Users } from 'lucide-react';
import { useData } from '../app/data';
import { groupBalances, listedGroups, myMemberId } from '../lib/ledger';
import { Amount, Button, Card, EmptyState, PageHeader, Tabs, useShowMore } from '../components/ui';
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
  // Where you're owed most first, down to where you owe most.
  const shown = groups.filter((g) => filter === 'all' || (filter === 'games' ? g.kind === 'club' : g.kind === 'expenses'))
    .sort((a, b) => myBal(b) - myBal(a) || a.name.localeCompare(b.name));
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
            <Card>
              {list.visible.map((g) => {
                const mine = myMemberId(g, me.id);
                const bal = mine ? groupBalances(g).get(mine) ?? 0 : 0;
                const games = g.sessions.filter((s) => s.status === 'final').length;
                const detail = [
                  KIND_LABEL[g.kind],
                  `${g.members.length} people`,
                  g.kind === 'club' ? `${games} game${games === 1 ? '' : 's'}` : `${g.expenses.length} expense${g.expenses.length === 1 ? '' : 's'}`,
                ].join(' · ');
                return (
                  <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3.5 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-2/60 md:px-5">
                    <GroupIcon kind={g.kind} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{g.name}</p>
                      <p className="truncate text-[13px] text-ink-2">{detail}</p>
                    </div>
                    {bal === 0 ? <span className="text-[13px] text-ink-2">Settled</span> : <Amount cents={bal} currency={g.currency} sign className="text-base font-semibold" />}
                  </Link>
                );
              })}
              {list.more}
            </Card>
          )}
        </>
      )}
      <CreateGroupDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
