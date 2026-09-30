import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Spade, Plus, Receipt, HandCoins, ChevronRight, Radio } from 'lucide-react';
import { useData } from '../app/data';
import { activity, groupBalances, monthlyNet, myMemberId, pokerStats, totals } from '../lib/ledger';
import { formatDate, formatMoney } from '../lib/money';
import { Amount, Button, Card, CardHeader, EmptyState, PageHeader, Row } from '../components/ui';
import { GroupIcon } from './GroupsPage';
import { NewGameDialog } from '../components/dialogs/NewGameDialog';
import { CreateGroupDialog } from '../components/dialogs/CreateGroupDialog';

const ACTIVITY_ICON = { expense: Receipt, game: Spade, payment: HandCoins };

export function DashboardPage() {
  const data = useData();
  const { me, groups } = data;
  const currency = me.default_currency || 'USD';
  const t = totals(data);
  const months = monthlyNet(data);
  const feed = activity(data, 8);
  const poker = pokerStats(data);
  const openGames = groups.flatMap((g) => g.sessions.filter((s) => s.status === 'open').map((s) => ({ g, s })));
  const [newGame, setNewGame] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${greet}, ${me.display_name.split(' ')[0]}`}
        actions={<>
          <Button onClick={() => setNewGroup(true)}><Plus size={16} aria-hidden="true" />New group</Button>
          <Button variant="primary" onClick={() => setNewGame(true)}><Spade size={16} aria-hidden="true" />Start game day</Button>
        </>} />

      <section className="felt mb-5 rounded-2xl p-5 md:p-7">
        <p className="text-sm opacity-80">{t.net === 0 ? "You're all square" : t.net > 0 ? 'Overall, you are owed' : 'Overall, you owe'}</p>
        <p className="amount mt-1 font-display text-5xl font-medium tracking-tight md:text-6xl">{formatMoney(Math.abs(t.net), currency)}</p>
        <div className="mt-5 flex gap-8 border-t border-felt-ink/15 pt-4 text-sm">
          <div><p className="opacity-75">Owed to you</p><p className="amount font-display text-xl">{formatMoney(t.owed, currency)}</p></div>
          <div><p className="opacity-75">You owe</p><p className="amount font-display text-xl">{formatMoney(t.owe, currency)}</p></div>
          {poker.games > 0 && (
            <div className="hidden sm:block"><p className="opacity-75">Poker, all time</p><p className="amount font-display text-xl">{formatMoney(poker.net, currency, { sign: true })}</p></div>
          )}
        </div>
      </section>

      {openGames.length > 0 && (
        <div className="mb-5 space-y-2">
          {openGames.map(({ g, s }) => (
            <Link key={s.id} to={`/groups/${g.id}/games/${s.id}`}
              className="flex items-center gap-3 rounded-2xl border border-brass/40 bg-brass/10 px-4 py-3 hover:bg-brass/15">
              <Radio size={18} className="text-brass" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Game in progress{s.location ? ` at ${s.location}` : ''}</p>
                <p className="text-[13px] text-ink-2">{g.name}, {s.results.length} players. Enter cash-outs when the table breaks.</p>
              </div>
              <ChevronRight size={18} className="text-ink-2" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Your last six months" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap px-4 text-[12px] text-ink-2 md:px-5">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gain" />Poker won</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-loss" />Poker lost</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-2/40" />Your share of expenses</span>
          </div>
          <div className="h-56 px-2 pb-3 pt-2 text-ink-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
                <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12 }}
                  tickFormatter={(v: number) => formatMoney(v, currency)} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
                <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.06 }}
                  contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 13 }}
                  labelStyle={{ color: 'rgb(var(--ink))', fontWeight: 600 }}
                  formatter={(v: number, key: string) => key === 'poker' ? [formatMoney(v, currency, { sign: true }), 'Poker'] : [formatMoney(v, currency), 'Your share']} />
                <Bar dataKey="poker" radius={[4, 4, 4, 4]} maxBarSize={28}>
                  {months.map((m) => <Cell key={m.key} className={m.poker >= 0 ? 'fill-gain' : 'fill-loss'} />)}
                </Bar>
                <Bar dataKey="spent" radius={[4, 4, 4, 4]} maxBarSize={28} className="fill-ink-2" fillOpacity={0.35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Groups" action={<Link to="/groups" className="text-[13px] font-semibold text-felt dark:text-gain">See all</Link>} />
          <div className="mt-2">
            {groups.length === 0 ? (
              <EmptyState icon={<Spade size={28} />} title="Start your first group" body="A group holds your poker games, shared expenses, or both."
                action={<Button variant="primary" onClick={() => setNewGroup(true)}>Create group</Button>} />
            ) : groups.map((g) => {
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
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent activity" />
        <div className="mt-2">
          {feed.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="Nothing logged yet" body="Game days, expenses, and payments show up here." />
          ) : feed.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind];
            return (
              <Link key={a.id} to={a.link} className="block">
                <Row className="hover:bg-surface-2/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Icon size={16} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="truncate text-[12px] text-ink-2">{a.group.name}, {a.detail}, {formatDate(a.date, { month: 'short', day: 'numeric' })}</p>
                  </div>
                  {a.impact !== null ? <Amount cents={a.impact} currency={a.group.currency} sign /> : <span className="text-right text-[12px] text-ink-2">{a.note ?? 'not involved'}</span>}
                </Row>
              </Link>
            );
          })}
        </div>
      </Card>

      <NewGameDialog open={newGame} onClose={() => setNewGame(false)} />
      <CreateGroupDialog open={newGroup} onClose={() => setNewGroup(false)} />
    </>
  );
}
