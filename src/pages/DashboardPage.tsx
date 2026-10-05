import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Spade, Plus, Receipt, HandCoins, ChevronRight, Radio, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useData } from '../app/data';
import { activity, friendBalances, groupBalances, isGameHost, listedGroups, moneyPhrase, myMemberId, totals } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Avatar, BalanceText, Button, Card, CardHeader, EmptyState, PageHeader, Row, useShowMore } from '../components/ui';
import { GroupIcon } from './GroupsPage';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';
import { QuickExpenseDialog } from '../components/dialogs/QuickExpenseDialog';

const ACTIVITY_ICON = { expense: Receipt, game: Spade, payment: HandCoins };

export function DashboardPage() {
  const data = useData();
  const { me } = data;
  const groups = listedGroups(data);
  // Where you stand with each friend across every group and one-on-one -- same numbers as the Friends page.
  const currency = me.default_currency || 'USD';
  // Biggest amount owed to you first, down to what you owe most -- same order everywhere.
  const friends = friendBalances(data).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const myBal = (g: (typeof data.groups)[number]) => { const mine = myMemberId(g, me.id); return mine ? groupBalances(g).get(mine) ?? 0 : 0; };
  const groupList = groups.map((g) => ({ g, bal: myBal(g) })).sort((a, b) => b.bal - a.bal || a.g.name.localeCompare(b.g.name));
  const groupsMore = useShowMore(groupList, 5);
  const friendsMore = useShowMore(friends, 5);
  const t = totals(data);
  const feed = activity(data, 5, undefined, true);
  const openGames = data.groups.flatMap((g) => g.sessions.filter((s) => s.status === 'open').map((s) => ({ g, s })));
  const [newGroup, setNewGroup] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${greet}, ${me.display_name.split(' ')[0]}`}
        actions={<>
          <Button onClick={() => setQuickExpense(true)}><Receipt size={16} aria-hidden="true" />Add expense</Button>
          <Button variant="primary" onClick={() => setNewGroup(true)}><Plus size={16} aria-hidden="true" />New group</Button>
        </>} />

      <section className={clsx('hero mb-5 rounded-2xl px-4 py-3.5 shadow-md md:px-6 md:py-5', t.net > 0 ? 'hero-gain' : t.net < 0 ? 'hero-loss' : 'hero-even')}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-85">{t.net === 0 ? "You're all square" : t.net > 0 ? "You're owed" : 'You owe'}</p>
            <p className="amount font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{formatMoney(Math.abs(t.net), currency)}</p>
          </div>
          <div className="shrink-0 space-y-1 text-right text-[13px] font-semibold">
            <p className="hero-tile flex items-center justify-end gap-1 rounded-full px-2.5 py-0.5"><ArrowUpRight size={13} aria-hidden="true" /><span className="amount text-[#b7ffd9]">{formatMoney(t.owed, currency)}</span><span className="opacity-85">owed</span></p>
            <p className="hero-tile flex items-center justify-end gap-1 rounded-full px-2.5 py-0.5"><ArrowDownRight size={13} aria-hidden="true" /><span className="amount text-[#ffd0c4]">{formatMoney(t.owe, currency)}</span><span className="opacity-85">you owe</span></p>
          </div>
        </div>
        {t.others.length > 0 && (
          <p className="amount mt-2 text-[12px] font-semibold opacity-90">{t.others.map((m) => `${m.currency}: ${moneyPhrase(m, 'overall')}`).join('  ·  ')}</p>
        )}
      </section>

      {openGames.length > 0 && (
        <div className="mb-5 space-y-2">
          {openGames.map(({ g, s }) => (
            <Link key={s.id} to={`/groups/${g.id}/games/${s.id}`}
              className="flex items-center gap-3 rounded-2xl border border-brass/40 bg-brass/10 px-4 py-3 hover:bg-brass/15">
              <Radio size={18} className="text-brass" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Game in progress{s.location ? ` at ${s.location}` : ''}</p>
                <p className="text-[13px] text-ink-2">{g.name}, {s.results.length} players. {isGameHost(g, s, me.id) ? 'Enter cash-outs when the table breaks.' : 'Tap to follow the scores.'}</p>
              </div>
              <ChevronRight size={18} className="text-ink-2" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Groups" action={groups.length > 0 && <Link to="/groups" className="text-[13px] font-semibold text-felt dark:text-gain">See all</Link>} />
        <div className="mt-2">
          {groups.length === 0 ? (
            <EmptyState icon={<Spade size={28} />} title="Start your first group" body="A club holds your card games, or make a group for shared expenses."
              action={<Button variant="primary" onClick={() => setNewGroup(true)}>Create group</Button>} />
          ) : groupsMore.visible.map(({ g, bal }) => {
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-2/60 md:px-5">
                <GroupIcon kind={g.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p className="text-[12px] text-ink-2">{g.members.length} people</p>
                </div>
                <Amount cents={bal} currency={g.currency} sign />
              </Link>
            );
          })}
        </div>
        {groupsMore.more}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Friends" action={<Link to="/friends" className="text-[13px] font-semibold text-felt dark:text-gain">See all</Link>} />
        <p className="px-4 text-[12px] text-ink-2 md:px-5">Across all your groups and one-on-one.</p>
        <div className="mt-1">
          {friends.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="No friends yet" body="Split something with a friend, or add them to a group."
              action={<Button onClick={() => setQuickExpense(true)}><Receipt size={16} aria-hidden="true" />Add expense</Button>} />
          ) : friendsMore.visible.map((f) => (
            <Link key={f.key} to={`/friends/${encodeURIComponent(f.key)}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60 md:px-5">
              <Avatar name={f.name} src={f.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                {f.others.length > 0 && <p className="truncate text-[11px] text-ink-2">also {f.others.map((m) => moneyPhrase(m, 'friend')).join(', ')}</p>}
              </div>
              <BalanceText cents={f.net} currency={f.currency} />
            </Link>
          ))}
        </div>
        {friendsMore.more}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Recent activity" action={feed.length > 0 && <Link to="/activity" className="text-[13px] font-semibold text-felt dark:text-gain">See more</Link>} />
        <div className="mt-2">
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
                    <p className="truncate text-[12px] text-ink-2">{a.group.is_direct ? `with ${a.group.name}` : a.group.name}, {a.detail}, {formatDate(a.date, { month: 'short', day: 'numeric' })}</p>
                  </div>
                  {a.impact !== null ? <Amount cents={a.impact} currency={a.group.currency} sign /> : <span className="text-right text-[12px] text-ink-2">{a.note ?? 'not involved'}</span>}
                </Row>
              </Link>
            );
          })}
        </div>
      </Card>

      <CreateGroupDialog open={newGroup} onClose={() => setNewGroup(false)} />
      <QuickExpenseDialog open={quickExpense} onClose={() => setQuickExpense(false)} />
    </>
  );
}
