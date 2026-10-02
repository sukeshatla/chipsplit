import type { AppData, ChangeLogEntry, GameSession, Group, SessionResult } from './types';
import { settle, type Transfer } from './settle';
import { formatMoney } from './money';

/** One player's result for a game: everything they took out (final stack + chips given back) minus what they bought. */
export function resultNet(r: SessionResult): number {
  return r.cash_out_cents + (r.returned_cents ?? 0) - r.buy_in_cents;
}

function add(map: Map<string, number>, id: string, v: number) {
  map.set(id, (map.get(id) ?? 0) + v);
}

/**
 * Net balance per member for one group, in cents.
 * Positive = the group owes them. Negative = they owe the group.
 * Expenses: payers +, shares −. Finalized games: cash-out − buy-in.
 * Settlements: the payer's debt shrinks (+), the receiver's credit shrinks (−).
 */
export function groupBalances(g: Group): Map<string, number> {
  const m = new Map<string, number>();
  g.members.forEach((x) => m.set(x.id, 0));
  for (const e of g.expenses) {
    e.payers.forEach((p) => add(m, p.member_id, p.amount_cents));
    e.shares.forEach((s) => add(m, s.member_id, -s.amount_cents));
  }
  for (const s of g.sessions) {
    if (s.status !== 'final') continue;
    s.results.forEach((r) => add(m, r.member_id, resultNet(r)));
  }
  for (const st of g.settlements) {
    add(m, st.from_member, st.amount_cents);
    add(m, st.to_member, -st.amount_cents);
  }
  return m;
}

export function sessionNets(s: GameSession): Map<string, number> {
  const m = new Map<string, number>();
  s.results.forEach((r) => add(m, r.member_id, resultNet(r)));
  return m;
}

export function sessionTotals(s: GameSession) {
  const buyIn = s.results.reduce((a, r) => a + r.buy_in_cents, 0);
  const cashOut = s.results.reduce((a, r) => a + r.cash_out_cents + (r.returned_cents ?? 0), 0);
  return { buyIn, cashOut, diff: cashOut - buyIn };
}

/** Whether every player's net for this game is zero once settlements tied to it are applied.
 *  Open games are always "settled" (nothing to owe until finalized). The database also
 *  enforces this before a delete. */
export function isSessionSettled(g: Group, s: GameSession): boolean {
  if (s.status !== 'final') return true;
  const m = sessionNets(s);
  for (const st of g.settlements) {
    if (st.session_id !== s.id) continue;
    add(m, st.from_member, st.amount_cents);
    add(m, st.to_member, -st.amount_cents);
  }
  return [...m.values()].every((v) => v === 0);
}

export function simplify(balances: Map<string, number>): Transfer[] {
  return settle([...balances].map(([id, cents]) => ({ id, cents })));
}

export function myMemberId(g: Group, meId: string) {
  return g.members.find((m) => m.user_id === meId)?.id;
}

export function memberName(g: Group, id: string) {
  return g.members.find((m) => m.id === id)?.name ?? 'Unknown';
}

/** "Srinath Pinnaka" -> "Srinath P." for compact rows. Single names stay as-is, and if the short
 *  form would collide with someone else's in `others` (two "Srinath P."s), the full name is kept. */
export function shortName(name: string, others: string[] = []): string {
  const short = abbreviate(name);
  if (short === name) return name;
  const clash = others.some((o) => o !== name && abbreviate(o) === short);
  return clash ? name : short;
}

function abbreviate(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** memberName, shortened for list rows; full names stay in headings, pickers, and the Members tab. */
export function memberShort(g: Group, id: string) {
  return shortName(memberName(g, id), g.members.map((m) => m.name));
}

export function memberAvatar(g: Group, id: string): string | null {
  return g.members.find((m) => m.id === id)?.avatar_url ?? null;
}

/** Whether the signed-in user can change group settings, delete the group, or delete an expense. */
export function isGroupAdmin(g: Group, meId: string): boolean {
  return g.members.some((m) => m.user_id === meId && m.is_admin);
}

/** Whether the signed-in user hosts this game: started it, or (old games with no recorded host) is a group admin.
 *  Only the host can change, finalize, reopen, mark payments on, or delete a game; everyone else views it. */
export function isGameHost(g: Group, s: GameSession, meId: string): boolean {
  return s.created_by ? s.created_by === meId : isGroupAdmin(g, meId);
}

/** Whether everyone in the group is at zero. The database also enforces this before a delete. */
export function isGroupSettled(g: Group): boolean {
  return [...groupBalances(g).values()].every((v) => v === 0);
}

/** Groups shown in Groups lists: everything except friend-only (direct) expense groups. */
export function listedGroups(data: AppData): Group[] {
  return data.groups.filter((g) => !g.is_direct);
}

/** For a direct group with exactly one other person, that person's friend key -- so links
 *  about it can go to their friend page instead of a group page nobody sees in lists. */
export function directFriendKey(g: Group, meId: string): string | null {
  if (!g.is_direct) return null;
  const others = g.members.filter((m) => m.user_id !== meId);
  return others.length === 1 ? friendKey(others[0]!) : null;
}

export function memberHasActivity(g: Group, memberId: string) {
  // Deleted expenses count: they can still be restored, and the database won't remove a member they reference.
  return (
    [...g.expenses, ...(g.deleted_expenses ?? [])].some((e) => e.payers.some((p) => p.member_id === memberId) || e.shares.some((s) => s.member_id === memberId)) ||
    g.sessions.some((s) => s.results.some((r) => r.member_id === memberId)) ||
    g.settlements.some((s) => s.from_member === memberId || s.to_member === memberId)
  );
}

/** One friend across groups and contacts: matched by account, then by email, else a standalone guest. */
export function friendKey(x: { id: string; user_id: string | null; email: string | null }) {
  if (x.user_id) return `u:${x.user_id}`;
  if (x.email) return `e:${x.email.toLowerCase()}`;
  return `m:${x.id}`;
}

export type FriendStatus = 'friend' | 'invited' | 'guest';

/** 'friend' = linked to a real account, 'invited' = has an email but hasn't signed up, 'guest' = name only. */
export function statusFromKey(key: string): FriendStatus {
  if (key.startsWith('u:')) return 'friend';
  if (key.startsWith('e:')) return 'invited';
  return 'guest';
}

export const STATUS_LABEL: Record<FriendStatus, string> = { friend: 'Friend', invited: 'Invited', guest: 'Guest' };

export interface FriendGroupBalance { group: Group; memberId: string; myMemberId: string; cents: number }
/** An amount in one currency. Balances in different currencies are never added together. */
export interface Money { currency: string; cents: number }
export interface Friend {
  key: string; name: string; email: string | null; avatar_url: string | null;
  /** Their balance in `currency`, the currency they have the biggest balance in (positive = they owe you). */
  net: number;
  currency: string;
  /** Balances in any other currencies, biggest first (e.g. a USD club plus an INR one-on-one). */
  others: Money[];
  groups: FriendGroupBalance[];
}

/** Totals per currency, nonzero only, biggest first. */
export function sumByCurrency(items: Money[]): Money[] {
  const m = new Map<string, number>();
  items.forEach((x) => add(m, x.currency, x.cents));
  return [...m].map(([currency, cents]) => ({ currency, cents })).filter((x) => x.cents !== 0)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

/** Split per-currency balances into the main one (or `fallback` at zero) and the rest. */
function primary(balances: Money[], fallback: string): { net: number; currency: string; others: Money[] } {
  if (!balances.length) return { net: 0, currency: fallback, others: [] };
  return { net: balances[0]!.cents, currency: balances[0]!.currency, others: balances.slice(1) };
}

/**
 * Splitwise-style per-friend balances. Each group's debts are simplified first, then the
 * payments between you and each person are summed across every group you share -- per
 * currency, since a USD club and an INR one-on-one can't be added together.
 * Positive net = they owe you.
 */
export function friendBalances(data: AppData): Friend[] {
  const fallback = data.me.default_currency || 'USD';
  const map = new Map<string, Friend>();
  for (const g of data.groups) {
    const mine = myMemberId(g, data.me.id);
    if (!mine) continue;
    const perMember = new Map<string, number>();
    for (const t of simplify(groupBalances(g))) {
      if (t.from === mine) add(perMember, t.to, -t.cents);
      else if (t.to === mine) add(perMember, t.from, t.cents);
    }
    for (const m of g.members) {
      if (m.id === mine) continue;
      const key = friendKey(m);
      let f = map.get(key);
      if (!f) {
        f = { key, name: m.name, email: m.email, avatar_url: m.avatar_url ?? null, net: 0, currency: fallback, others: [], groups: [] };
        map.set(key, f);
      }
      f.groups.push({ group: g, memberId: m.id, myMemberId: mine, cents: perMember.get(m.id) ?? 0 });
    }
  }
  for (const f of map.values()) {
    Object.assign(f, primary(sumByCurrency(f.groups.map((fg) => ({ currency: fg.group.currency, cents: fg.cents }))), fallback));
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
}

export interface FriendRow extends Friend {
  contactId: string | null; // set once this person is in the signed-in user's own friends list
  status: FriendStatus;
}

/**
 * The Friends page: everyone you share a group with, plus everyone in your own address
 * book (src/api DataApi `contacts`) even if they aren't in a shared group yet. The same
 * person collapses into one row whether they showed up via a group or via `contacts`.
 */
export function friendsList(data: AppData): FriendRow[] {
  const fallback = data.me.default_currency || 'USD';
  const rows = new Map<string, FriendRow>();
  for (const f of friendBalances(data)) rows.set(f.key, { ...f, contactId: null, status: statusFromKey(f.key) });
  for (const c of data.contacts) {
    const key = friendKey(c);
    const existing = rows.get(key);
    if (existing) { existing.contactId = c.id; existing.avatar_url ??= c.avatar_url ?? null; }
    else rows.set(key, { key, name: c.name, email: c.email, avatar_url: c.avatar_url ?? null, net: 0, currency: fallback, others: [], groups: [], contactId: c.id, status: statusFromKey(key) });
  }
  return [...rows.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
}

/** "owes you ₹58,184" / "you owe ₹500" (perspective: the friend), or "you are owed ₹58,184" /
 *  "you owe ₹500" (perspective: you, overall). For balances shown beside a main-currency figure. */
export function moneyPhrase(m: Money, perspective: 'friend' | 'overall'): string {
  const amount = formatMoney(Math.abs(m.cents), m.currency);
  if (m.cents > 0) return perspective === 'friend' ? `owes you ${amount}` : `you are owed ${amount}`;
  return `you owe ${amount}`;
}

/** Where you stand overall. `owed`/`owe`/`net` are in your own currency (Profile); balances in
 *  any other currency are reported separately in `others` as a net per currency -- never converted. */
export function totals(data: AppData) {
  const currency = data.me.default_currency || 'USD';
  let owed = 0, owe = 0;
  const others: Money[] = [];
  for (const f of friendBalances(data)) {
    for (const b of [{ currency: f.currency, cents: f.net }, ...f.others]) {
      if (b.currency !== currency) others.push(b);
      else if (b.cents > 0) owed += b.cents;
      else owe -= b.cents;
    }
  }
  return { currency, owed, owe, net: owed - owe, others: sumByCurrency(others) };
}

export interface ActivityItem {
  id: string;
  kind: 'expense' | 'game' | 'payment';
  date: string;
  createdAt: string;
  title: string;
  detail: string;
  group: Group;
  impact: number | null; // effect on your balance, null if not involved
  note?: string; // shown instead of an amount when impact is null
  link: string;
}

/** `onlyMine` drops anything you weren't a payer/sharer/player/party to -- for the Dashboard feed,
 *  as opposed to a group's own History tab, which is the place to see everything in that group. */
export function activity(data: AppData, limit = 20, onlyGroupId?: string, onlyMine?: boolean): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const g of data.groups) {
    if (onlyGroupId && g.id !== onlyGroupId) continue;
    const mine = myMemberId(g, data.me.id);
    const direct = directFriendKey(g, data.me.id);
    for (const e of g.expenses) {
      const paid = e.payers.filter((p) => p.member_id === mine).reduce((a, p) => a + p.amount_cents, 0);
      const share = e.shares.filter((s) => s.member_id === mine).reduce((a, s) => a + s.amount_cents, 0);
      if (onlyMine && !paid && !share) continue;
      const payerNames = e.payers.map((p) => memberName(g, p.member_id)).join(', ');
      items.push({
        id: e.id, kind: 'expense', date: e.spent_on, createdAt: e.created_at, title: e.description,
        detail: `${payerNames} paid`, group: g, impact: paid || share ? paid - share : null,
        link: direct ? `/friends/${encodeURIComponent(direct)}?expense=${e.id}` : `/groups/${g.id}?tab=expenses&expense=${e.id}`,
      });
    }
    for (const s of g.sessions) {
      const r = s.results.find((x) => x.member_id === mine);
      if (onlyMine && !r) continue;
      items.push({
        id: s.id, kind: 'game', date: s.played_on, createdAt: s.created_at,
        title: s.location ? `Game at ${s.location}` : 'Game',
        detail: s.status === 'final' ? `${s.results.length} players` : 'In progress',
        group: g, impact: r && s.status === 'final' ? resultNet(r) : null,
        note: r && s.status === 'open' ? 'playing' : undefined,
        link: `/groups/${g.id}/games/${s.id}`,
      });
    }
    for (const st of g.settlements) {
      if (onlyMine && st.from_member !== mine && st.to_member !== mine) continue;
      items.push({
        id: st.id, kind: 'payment', date: st.settled_on, createdAt: st.created_at,
        title: `${memberName(g, st.from_member)} paid ${memberName(g, st.to_member)}`,
        detail: st.method ? `via ${st.method}` : 'Payment recorded', group: g,
        impact: null,
        note: st.from_member === mine ? `you paid ${formatMoney(st.amount_cents, g.currency)}`
          : st.to_member === mine ? `you got ${formatMoney(st.amount_cents, g.currency)}` : undefined,
        link: direct ? `/friends/${encodeURIComponent(direct)}` : `/groups/${g.id}?tab=balances`,
      });
    }
  }
  return items
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export interface LeaderRow { memberId: string; name: string; avatar_url: string | null; net: number; games: number; wins: number; best: number }

export function pokerLeaderboard(g: Group): LeaderRow[] {
  const rows = new Map<string, LeaderRow>();
  for (const s of g.sessions) {
    if (s.status !== 'final') continue;
    for (const r of s.results) {
      const net = resultNet(r);
      const row = rows.get(r.member_id) ?? { memberId: r.member_id, name: memberName(g, r.member_id), avatar_url: memberAvatar(g, r.member_id), net: 0, games: 0, wins: 0, best: 0 };
      row.net += net;
      row.games += 1;
      if (net > 0) row.wins += 1;
      row.best = Math.max(row.best, net);
      rows.set(r.member_id, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.net - a.net);
}

export function pokerStats(data: AppData) {
  let net = 0, games = 0, wins = 0, best = 0, worst = 0;
  for (const g of data.groups) {
    const mine = myMemberId(g, data.me.id);
    for (const s of g.sessions) {
      if (s.status !== 'final') continue;
      const r = s.results.find((x) => x.member_id === mine);
      if (!r) continue;
      const n = resultNet(r);
      net += n; games += 1;
      if (n > 0) wins += 1;
      best = Math.max(best, n);
      worst = Math.min(worst, n);
    }
  }
  return { net, games, wins, best, worst, winRate: games ? Math.round((wins / games) * 100) : 0 };
}

/**
 * A `mailto:` link with a plain-text balance summary, for the involved parties.
 * Pass `sessionId` to summarize just one game (its players only); omit it for the whole group.
 * Members who opted out (or have no email on file) are left off the recipient list.
 */
export function summaryMailto(g: Group, sessionId?: string): string {
  const session = sessionId ? g.sessions.find((s) => s.id === sessionId) : undefined;
  const bal = session ? sessionNets(session) : groupBalances(g);
  const transfers = simplify(bal);
  const involved = new Set(bal.keys());
  const recipients = g.members.filter((m) => m.email && !m.email_opt_out && involved.has(m.id)).map((m) => m.email!);

  const subject = session ? `Chip n Split summary — ${g.name}${session.location ? `, ${session.location}` : ''}` : `Chip n Split summary — ${g.name}`;
  const lines: string[] = [subject, '-'.repeat(Math.min(subject.length, 42)), ''];
  for (const id of involved) {
    const cents = bal.get(id) ?? 0;
    if (cents === 0) continue;
    lines.push(`  ${memberName(g, id)} ${cents > 0 ? 'is owed' : 'owes'} ${formatMoney(Math.abs(cents), g.currency)}`);
  }
  lines.push('', 'Settle up:');
  if (transfers.length === 0) lines.push('  Everyone is settled up.');
  else transfers.forEach((t) => lines.push(`  ${memberName(g, t.from)} → ${memberName(g, t.to)}   ${formatMoney(t.cents, g.currency)}`));
  lines.push('', '— Sent from Chip n Split');

  const to = recipients.map(encodeURIComponent).join(',');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

/** A `mailto:` reminder addressed to just the one person who owes this transfer. Returns
 *  null when they have no email on file, so a caller can disable the button in that case. */
export function reminderMailto(g: Group, t: Transfer): string | null {
  const debtor = g.members.find((m) => m.id === t.from);
  if (!debtor?.email) return null;
  const creditor = memberName(g, t.to);
  const amount = formatMoney(t.cents, g.currency);
  const subject = `Reminder: you owe ${amount} in ${g.name}`;
  const body = [
    `Hey ${debtor.name},`, '',
    `Just a friendly reminder that you owe ${creditor} ${amount} in ${g.name}.`, '',
    'Whenever works for you — thanks!',
  ].join('\n');
  return `mailto:${encodeURIComponent(debtor.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface SessionTransfer { from: string; to: string; cents: number; settlementId: string | null }

/** Who pays whom for one game, and which of those payments are already recorded. */
export function sessionPayments(g: Group, s: GameSession): SessionTransfer[] {
  const used = new Set<string>();
  const recorded = g.settlements.filter((x) => x.session_id === s.id);
  return simplify(sessionNets(s)).map((t) => {
    const hit = recorded.find((x) => !used.has(x.id) && x.from_member === t.from && x.to_member === t.to && x.amount_cents === t.cents);
    if (hit) used.add(hit.id);
    return { ...t, settlementId: hit?.id ?? null };
  });
}

/** Where a notification should take you when clicked. */
export function notificationLink(e: ChangeLogEntry): string {
  switch (e.entity_type) {
    case 'expense': return e.entity_id ? `/groups/${e.group_id}?tab=expenses&expense=${e.entity_id}` : `/groups/${e.group_id}?tab=expenses`;
    case 'session': return e.entity_id ? `/groups/${e.group_id}/games/${e.entity_id}` : `/groups/${e.group_id}?tab=games`;
    case 'settlement': return `/groups/${e.group_id}?tab=balances`;
    case 'member': return `/groups/${e.group_id}?tab=members`;
    default: return `/groups/${e.group_id}`;
  }
}
