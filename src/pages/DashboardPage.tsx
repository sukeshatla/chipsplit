import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spade, Plus, Receipt, HandCoins, ChevronRight, Radio, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useData } from '../app/data';
import { activity, friendBalances, groupBalances, isGameHost, listedGroups, moneyPhrase, myMemberId, pokerStats, sumByCurrency, totals } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Avatar, BalanceText, Button, Card, CardHeader, EmptyState, PageHeader, Row } from '../components/ui';
import { GroupIcon } from './GroupsPage';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';
import { QuickExpenseDialog } from '../components/dialogs/QuickExpenseDialog';

const ACTIVITY_ICON = { expense: Receipt, game: Spade, payment: HandCoins };

export function DashboardPage() {
  const data = useData();
  const { me } = data;
  const groups = listedGroups(data);
  // Friends you have one-on-one (non-group) expenses with, and where you stand with each.
  const currency = me.default_currency || 'USD';
  const directFriends = friendBalances(data)
    .filter((f) => f.groups.some((fg) => fg.group.is_direct))
    .map((f) => {
      // Per currency, like everywhere else: show the biggest, mention the rest.
      const [main, ...rest] = sumByCurrency(f.groups.filter((fg) => fg.group.is_direct).map((fg) => ({ currency: fg.group.currency, cents: fg.cents })));
      return { ...f, direct: main ?? { currency: f.groups.find((fg) => fg.group.is_direct)!.group.currency, cents: 0 }, directOthers: rest };
    })
    .sort((a, b) => Math.abs(b.direct.cents) - Math.abs(a.direct.cents) || a.name.localeCompare(b.name));
  const t = totals(data);
  const feed = activity(data, 5, undefined, true);
  const poker = pokerStats(data);
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

      <section className="felt mb-5 rounded-2xl p-4 md:p-7">
        <p className="text-sm opacity-80">{t.net === 0 ? "You're all square" : t.net > 0 ? 'Overall, you are owed' : 'Overall, you owe'}</p>
        <p className="amount mt-1 font-display text-4xl font-medium tracking-tight md:text-6xl">{formatMoney(Math.abs(t.net), currency)}</p>
        <div className="mt-4 flex gap-6 border-t md:mt-5 md:gap-8 border-felt-ink/15 pt-4 text-sm">
          <div>
            <p className="flex items-center gap-1 opacity-75"><ArrowUpRight size={14} className="text-brass" aria-hidden="true" />Owed to you</p>
            <p className="amount font-display text-lg text-brass md:text-xl">{formatMoney(t.owed, currency)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 opacity-75"><ArrowDownRight size={14} className="text-loss" aria-hidden="true" />You owe</p>
            <p className="amount font-display text-lg text-loss md:text-xl">{formatMoney(t.owe, currency)}</p>
          </div>
          {poker.games > 0 && (
            <div className="hidden sm:block"><p className="opacity-75">Clubs, all time</p><p className="amount font-display text-xl">{formatMoney(poker.net, currency, { sign: true })}</p></div>
          )}
        </div>
        {t.others.length > 0 && (
          <div className="mt-3 space-y-0.5 border-t border-felt-ink/15 pt-3 text-sm">
            {t.others.map((m) => <p key={m.currency}><span className="opacity-75">In {m.currency}:</span> <span className="amount font-semibold">{moneyPhrase(m, 'overall')}</span></p>)}
          </div>
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
          ) : groups.slice(0, 8).map((g) => {
            const mine = myMemberId(g, me.id);
            const bal = mine ? groupBalances(g).get(mine) ?? 0 : 0;
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
      </Card>

      <Card className="mt-5">
        <CardHeader title="Friends" action={<Link to="/friends" className="text-[13px] font-semibold text-felt dark:text-gain">See all</Link>} />
        <p className="px-4 text-[12px] text-ink-2 md:px-5">One-on-one expenses, outside any group.</p>
        <div className="mt-1">
          {directFriends.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="Nothing one-on-one yet" body="Split something with a friend without making a group."
              action={<Button onClick={() => setQuickExpense(true)}><Receipt size={16} aria-hidden="true" />Add expense</Button>} />
          ) : directFriends.slice(0, 6).map((f) => (
            <Link key={f.key} to={`/friends/${encodeURIComponent(f.key)}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60 md:px-5">
              <Avatar name={f.name} src={f.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                {f.directOthers.length > 0 && <p className="truncate text-[11px] text-ink-2">also {f.directOthers.map((m) => moneyPhrase(m, 'friend')).join(', ')}</p>}
              </div>
              <BalanceText cents={f.direct.cents} currency={f.direct.currency} />
            </Link>
          ))}
        </div>
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
