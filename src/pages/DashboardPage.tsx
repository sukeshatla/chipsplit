import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { rummyStandings } from '../lib/rummy';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Spade, Plus, Receipt, HandCoins, ChevronRight, Radio, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useData } from '../app/data';
import { activity, friendsList, groupBalances, isGameHost, isSettledFriend, listedGroups, moneyPhrase, myLiveGames, myMemberId, shortName, totals } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { AddExpenseButton, Amount, Avatar, BalanceText, Button, Card, CardHeader, EmptyState, PageHeader, Row, useShowMore } from '../components/ui';
import { GroupIcon } from '../components/GroupKind';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';
import { QuickExpenseDialog } from '../components/dialogs/QuickExpenseDialog';

const ACTIVITY_ICON = { expense: Receipt, game: Spade, payment: HandCoins };

const TILE = {
  gain: { box: 'border-[#3f9d68] bg-[#13281d]', icon: 'text-[#5fd391]', bar: 'bg-gradient-to-b from-[#6fe0a2] to-[#3f9d68]' },
  loss: { box: 'border-[#c4504a] bg-[#2b1618]', icon: 'text-[#ff8a80]', bar: 'bg-gradient-to-b from-[#ff8a80] to-[#c4504a]' },
  none: { box: 'border-[#2c3640] bg-[#1a2128]', icon: 'text-[#8a96a3]', bar: 'bg-[#5b6875]' },
};
const toneOf = (cents: number): keyof typeof TILE => (cents > 0 ? 'gain' : cents < 0 ? 'loss' : 'none');

/** "You get" / "You pay": green when money is coming to you, red when you owe, grey at zero. */
function StandTile({ label, cents, currency, tone, icon: Icon }: { label: string; cents: number; currency: string; tone: keyof typeof TILE; icon: typeof ArrowUpRight }) {
  return (
    <div className={clsx('flex items-start gap-2 rounded-xl border px-3 py-2', TILE[tone].box)}>
      <Icon size={18} className={clsx('mt-0.5 shrink-0', TILE[tone].icon)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-white/80">{label}</p>
        <p className="amount truncate font-display text-xl font-bold leading-tight md:text-2xl">{formatMoney(cents, currency)}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const data = useData();
  const { me } = data;
  const groups = listedGroups(data);
  // Where you stand with each friend across every group and one-on-one -- same numbers as the Friends page.
  const currency = me.default_currency || 'USD';
  // Biggest amount first, whether you're owed or you owe; settled up last -- same order everywhere.
  const allFriends = friendsList(data).filter((f) => f.groups.length > 0);
  // Only people with money open; settled-up friends live behind the Friends page's toggle (SPEC FRIEND-12).
  const friends = allFriends.filter((f) => !isSettledFriend(f)).sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  const myBal = (g: (typeof data.groups)[number]) => { const mine = myMemberId(g, me.id); return mine ? groupBalances(g).get(mine) ?? 0 : 0; };
  const groupList = groups.map((g) => ({ g, bal: myBal(g) })).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal) || a.g.name.localeCompare(b.g.name));
  const groupsMore = useShowMore(groupList, 5);
  const friendsMore = useShowMore(friends, 5);
  const t = totals(data);
  const feed = activity(data, 200, undefined, true);
  const feedMore = useShowMore(feed, 5);
  // Your games in progress, poker and rummy (SPEC DASH-1). Rummy games load per Rummy group,
  // under the same keys the group pages use, so they stay in step.
  const { api } = useAuth();
  const rummyLists = useQueries({ queries: data.groups.filter((g) => g.kind === 'rummy').map((g) => ({ queryKey: ['rummy-list', g.id], queryFn: () => api.loadRummyGames(g.id) })) });
  const liveGames = myLiveGames(data, rummyLists.flatMap((q) => q.data ?? []));
  const [newGroup, setNewGroup] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${greet}, ${me.display_name.split(' ')[0]}`}
        actions={<AddExpenseButton onClick={() => setQuickExpense(true)} />} />

      <section className="mb-5 space-y-2 rounded-2xl border border-white/10 bg-[#0e1417] p-2.5 text-white shadow-lg">
        {/* Net with a colored accent bar: green when you're up, red when you owe, grey when square. */}
        <div className={clsx('flex items-stretch gap-3 rounded-xl border border-white/10 px-3 py-3', { gain: 'bg-[#11241a]', loss: 'bg-[#281517]', none: 'bg-[#1a2128]' }[toneOf(t.net)])}>
          <span className={clsx('w-1.5 shrink-0 rounded-full', TILE[toneOf(t.net)].bar)} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/85">{t.net > 0 ? "Overall, you're up" : t.net < 0 ? 'Overall, you owe' : "Overall, you're square"}</p>
            <p className="amount font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">{formatMoney(t.net, currency, { sign: true })}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StandTile label="You get" cents={t.owed} currency={currency} tone={t.owed > 0 ? 'gain' : 'none'} icon={ArrowUpRight} />
          <StandTile label="You pay" cents={t.owe} currency={currency} tone={t.owe > 0 ? 'loss' : 'none'} icon={ArrowDownRight} />
        </div>
        {t.others.map((m) => (
          <div key={m.currency} className="flex items-stretch gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2">
            <span className={clsx('w-1 shrink-0 rounded-full', TILE[toneOf(m.cents)].bar)} aria-hidden="true" />
            <p className="amount text-[14px] font-semibold text-white/90">{m.currency}: <span className={TILE[toneOf(m.cents)].icon}>{moneyPhrase(m, 'overall')}</span></p>
          </div>
        ))}
      </section>

      {liveGames.length > 0 && (
        <div className="mb-5 space-y-2">
          {liveGames.map((live) => {
            const poker = live.kind === 'poker';
            const leader = poker ? null : rummyStandings(live.game).find((x) => !x.eliminated);
            return (
              <Link key={poker ? live.s.id : live.game.id} to={poker ? `/groups/${live.g.id}/games/${live.s.id}` : `/rummy/${live.game.id}`}
                className="flex items-center gap-3 rounded-2xl border border-brass/40 bg-brass/10 px-4 py-3 hover:bg-brass/15">
                <Radio size={18} className="text-brass" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {poker ? <>
                    <p className="text-sm font-semibold">Game in progress{live.s.location ? ` at ${live.s.location}` : ''}</p>
                    <p className="text-[13px] text-ink-2">{live.g.name}, {live.s.results.length} players. {isGameHost(live.g, live.s, me.id) ? 'Enter cash-outs when the table breaks.' : 'Tap to follow the scores.'}</p>
                  </> : <>
                    <p className="text-sm font-semibold">Rummy in progress{live.game.name ? `: ${live.game.name}` : ''}</p>
                    <p className="text-[13px] text-ink-2">{live.g.name}, {live.game.players.length} players, round {live.game.rounds.length + 1}{leader ? `. ${shortName(leader.player.name, live.game.players.map((p) => p.name))} leads` : ''}.</p>
                  </>}
                </div>
                <ChevronRight size={18} className="text-ink-2" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title="Groups" action={<Button size="sm" onClick={() => setNewGroup(true)}><Plus size={14} aria-hidden="true" />New group</Button>} />
        <div className="mt-2">
          {groups.length === 0 ? (
            <EmptyState icon={<Spade size={28} />} title="Start your first group" body="A poker or rummy group for your card nights, or an expense group for shared costs."
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
        <CardHeader title="Friends" />
        <p className="px-4 text-[12px] text-ink-2 md:px-5">Across all your groups and one-on-one.</p>
        <div className="mt-1">
          {friends.length === 0 && allFriends.length > 0 ? (
            <p className="px-4 pb-4 pt-2 text-sm text-ink-2 md:px-5">You're settled up with everyone.</p>
          ) : friends.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="No friends yet" body="Split something with a friend, or add them to a group."
              action={<AddExpenseButton onClick={() => setQuickExpense(true)} />} />
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
        <CardHeader title="Recent activity" />
        <div className="mt-2">
          {feed.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="Nothing logged yet" body="Games, expenses, and payments show up here." />
          ) : feedMore.visible.map((a) => {
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
        {feedMore.more}
      </Card>

      <CreateGroupDialog open={newGroup} onClose={() => setNewGroup(false)} />
      <QuickExpenseDialog open={quickExpense} onClose={() => setQuickExpense(false)} />
    </>
  );
}
