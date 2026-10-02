import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Spade, Receipt, Users } from 'lucide-react';
import { useData } from '../app/data';
import { groupBalances, myMemberId } from '../lib/ledger';
import { Amount, Avatar, Badge, Button, Card, EmptyState, PageHeader, Tabs } from '../components/ui';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';
import type { GroupKind } from '../lib/types';

export const KIND_LABEL: Record<GroupKind, string> = { club: 'Club', expenses: 'Expenses' };

type Filter = 'all' | 'games' | 'expenses';
const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'games', label: 'Clubs' }, { value: 'expenses', label: 'Trips & expenses' }];

export function GroupIcon({ kind, size = 36 }: { kind: GroupKind; size?: number }) {
  const Icon = kind === 'club' ? Spade : Receipt;
  return (
    <span style={{ width: size, height: size }}
      className={kind === 'club' ? 'felt inline-flex shrink-0 items-center justify-center rounded-xl' : 'inline-flex shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink'}>
      <Icon size={size * 0.46} aria-hidden="true" />
    </span>
  );
}

export function GroupsPage() {
  const { me, groups } = useData();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = groups.filter((g) => filter === 'all' || (filter === 'games' ? g.kind === 'club' : g.kind === 'expenses'));

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {shown.map((g) => {
                const mine = myMemberId(g, me.id);
                const bal = mine ? groupBalances(g).get(mine) ?? 0 : 0;
                const games = g.sessions.filter((s) => s.status === 'final').length;
                return (
                  <Link key={g.id} to={`/groups/${g.id}`} className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink/20 md:p-5">
                    <div className="flex items-start gap-3">
                      <GroupIcon kind={g.kind} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-medium md:text-lg">{g.name}</p>
                        <Badge tone={g.kind === 'club' ? 'felt' : 'neutral'}>{KIND_LABEL[g.kind]}</Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] text-ink-2">{bal === 0 ? 'Settled' : bal > 0 ? "You're owed" : 'You owe'}</p>
                        <Amount cents={Math.abs(bal) * Math.sign(bal)} currency={g.currency} className="text-base md:text-lg" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {g.members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} src={m.avatar_url} size={28} className="ring-2 ring-surface" />)}
                        {g.members.length > 6 && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold ring-2 ring-surface">+{g.members.length - 6}</span>}
                      </div>
                      <p className="text-[12px] text-ink-2">
                        {[
                          g.kind === 'club' && `${games} game${games === 1 ? '' : 's'}`,
                          (g.kind === 'expenses' || g.expenses.length > 0) && `${g.expenses.length} expense${g.expenses.length === 1 ? '' : 's'}`,
                        ].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
      <CreateGroupDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
