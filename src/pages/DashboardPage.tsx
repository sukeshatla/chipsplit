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
  // Biggest amount owed to you first, down to what you owe most -- same order everywhere.
  const friends = friendBalances(data).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const myBal = (g: (typeof data.groups)[number]) => { const mine = myMemberId(g, me.id); return mine ? groupBalances(g).get(mine) ?? 0 : 0; };
  const groupList = groups.map((g) => ({ g, bal: myBal(g) })).sort((a, b) => b.bal - a.bal || a.g.name.localeCompare(b.g.name));
  const groupsMore = useShowMore(groupList, 5);
  const friendsMore = useShowMore(friends, 5);
  const t = totals(data);
  const feed = activity(data, 200, undefined, true);
  const feedMore = useShowMore(feed, 5);
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
        <CardHeader title="Groups" />
        <div className="mt-2">
          {groups.length === 0 ? (
            <EmptyState icon={<Spade size={28} />} title="Start your first group" body="A club holds your card games, or make a group for shared expenses."
              action={<Button variant="primary" onClick={() => setNewGroup(true)}>Create group</Button>} />
          ) : groupsMore.visible.map(({ g, bal }) => {
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3.5 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-2/60 md:px-5">
                <GroupIcon kind={g.kind} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{g.name}</p>
                  <p className="text-[13px] text-ink-2">{g.members.length} people</p>
                </div>
                <Amount cents={bal} currency={g.currency} sign className="text-base font-semibold" />
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
