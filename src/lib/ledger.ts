import type { AppData, GameSession, Group, Member } from './types';
import { settle, type Transfer } from './settle';
import { formatMoney } from './money';

function add(map: Map<string, number>, id: string, v: number) {
  map.set(id, (map.get(id) ?? 0) + v);
}

/**
 * Net balance per member for one group, in cents.
 * Positive = the group owes them. Negative = they owe the group.
 * Expenses: payers +, shares −. Finalized game days: cash-out − buy-in.
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
    s.results.forEach((r) => add(m, r.member_id, r.cash_out_cents - r.buy_in_cents));
  }
  for (const st of g.settlements) {
    add(m, st.from_member, st.amount_cents);
    add(m, st.to_member, -st.amount_cents);
  }
  return m;
}

export function sessionNets(s: GameSession): Map<string, number> {
  const m = new Map<string, number>();
  s.results.forEach((r) => add(m, r.member_id, r.cash_out_cents - r.buy_in_cents));
  return m;
}

export function sessionTotals(s: GameSession) {
  const buyIn = s.results.reduce((a, r) => a + r.buy_in_cents, 0);
  const cashOut = s.results.reduce((a, r) => a + r.cash_out_cents, 0);
  return { buyIn, cashOut, diff: cashOut - buyIn };
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

export function memberHasActivity(g: Group, memberId: string) {
  return (
    g.expenses.some((e) => e.payers.some((p) => p.member_id === memberId) || e.shares.some((s) => s.member_id === memberId)) ||
    g.sessions.some((s) => s.results.some((r) => r.member_id === memberId)) ||
    g.settlements.some((s) => s.from_member === memberId || s.to_member === memberId)
  );
}

/** One friend across groups: matched by account, then by email, else treated as a separate guest. */
export function friendKey(m: Member) {
  if (m.user_id) return `u:${m.user_id}`;
  if (m.email) return `e:${m.email.toLowerCase()}`;
  return `m:${m.id}`;
}

export interface FriendGroupBalance { group: Group; memberId: string; myMemberId: string; cents: number }
export interface Friend { key: string; name: string; email: string | null; net: number; groups: FriendGroupBalance[] }

/**
 * Splitwise-style per-friend balances. Each group's debts are simplified first, then the
 * payments between you and each person are summed across every group you share.
 * Positive net = they owe you.
 */
export function friendBalances(data: AppData): Friend[] {
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
        f = { key, name: m.name, email: m.email, net: 0, groups: [] };
        map.set(key, f);
      }
      const cents = perMember.get(m.id) ?? 0;
      f.net += cents;
      f.groups.push({ group: g, memberId: m.id, myMemberId: mine, cents });
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
}

export function totals(data: AppData) {
  const friends = friendBalances(data);
  const owed = friends.filter((f) => f.net > 0).reduce((a, f) => a + f.net, 0);
  const owe = friends.filter((f) => f.net < 0).reduce((a, f) => a - f.net, 0);
  return { owed, owe, net: owed - owe };
}

/** Per month: your poker result and your share of group expenses (what you actually consumed). */
export function monthlyNet(data: AppData, months = 6, now = new Date()) {
  const buckets: { key: string; label: string; poker: number; spent: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      poker: 0,
      spent: 0,
    });
  }
  const find = (date: string) => buckets.find((x) => x.key === date.slice(0, 7));
  for (const g of data.groups) {
    const mine = myMemberId(g, data.me.id);
    if (!mine) continue;
    for (const e of g.expenses) {
      const share = e.shares.filter((s) => s.member_id === mine).reduce((a, s) => a + s.amount_cents, 0);
      const b = find(e.spent_on);
      if (b) b.spent += share;
    }
    for (const s of g.sessions) {
      if (s.status !== 'final') continue;
      const r = s.results.find((x) => x.member_id === mine);
      const b = find(s.played_on);
      if (r && b) b.poker += r.cash_out_cents - r.buy_in_cents;
    }
  }
  return buckets;
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

export function activity(data: AppData, limit = 20, onlyGroupId?: string): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const g of data.groups) {
    if (onlyGroupId && g.id !== onlyGroupId) continue;
    const mine = myMemberId(g, data.me.id);
    for (const e of g.expenses) {
      const paid = e.payers.filter((p) => p.member_id === mine).reduce((a, p) => a + p.amount_cents, 0);
      const share = e.shares.filter((s) => s.member_id === mine).reduce((a, s) => a + s.amount_cents, 0);
      const payerNames = e.payers.map((p) => memberName(g, p.member_id)).join(', ');
      items.push({
        id: e.id, kind: 'expense', date: e.spent_on, createdAt: e.created_at, title: e.description,
        detail: `${payerNames} paid`, group: g, impact: paid || share ? paid - share : null,
        link: `/groups/${g.id}?tab=expenses`,
      });
    }
    for (const s of g.sessions) {
      const r = s.results.find((x) => x.member_id === mine);
      items.push({
        id: s.id, kind: 'game', date: s.played_on, createdAt: s.created_at,
        title: s.location ? `Game day at ${s.location}` : 'Game day',
        detail: s.status === 'final' ? `${s.results.length} players` : 'In progress',
        group: g, impact: r && s.status === 'final' ? r.cash_out_cents - r.buy_in_cents : null,
        note: r && s.status === 'open' ? 'playing' : undefined,
        link: `/groups/${g.id}/games/${s.id}`,
      });
    }
    for (const st of g.settlements) {
      items.push({
        id: st.id, kind: 'payment', date: st.settled_on, createdAt: st.created_at,
        title: `${memberName(g, st.from_member)} paid ${memberName(g, st.to_member)}`,
        detail: st.method ? `via ${st.method}` : 'Payment recorded', group: g,
        impact: null,
        note: st.from_member === mine ? `you paid ${formatMoney(st.amount_cents, g.currency)}`
          : st.to_member === mine ? `you got ${formatMoney(st.amount_cents, g.currency)}` : undefined,
        link: `/groups/${g.id}?tab=balances`,
      });
    }
  }
  return items
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export interface LeaderRow { memberId: string; name: string; net: number; games: number; wins: number; best: number }

export function pokerLeaderboard(g: Group): LeaderRow[] {
  const rows = new Map<string, LeaderRow>();
  for (const s of g.sessions) {
    if (s.status !== 'final') continue;
    for (const r of s.results) {
      const net = r.cash_out_cents - r.buy_in_cents;
      const row = rows.get(r.member_id) ?? { memberId: r.member_id, name: memberName(g, r.member_id), net: 0, games: 0, wins: 0, best: 0 };
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
      const n = r.cash_out_cents - r.buy_in_cents;
      net += n; games += 1;
      if (n > 0) wins += 1;
      best = Math.max(best, n);
      worst = Math.min(worst, n);
    }
  }
  return { net, games, wins, best, worst, winRate: games ? Math.round((wins / games) * 100) : 0 };
}

export interface SessionTransfer { from: string; to: string; cents: number; settlementId: string | null }

/** Who pays whom for one game day, and which of those payments are already recorded. */
export function sessionPayments(g: Group, s: GameSession): SessionTransfer[] {
  const used = new Set<string>();
  const recorded = g.settlements.filter((x) => x.session_id === s.id);
  return simplify(sessionNets(s)).map((t) => {
    const hit = recorded.find((x) => !used.has(x.id) && x.from_member === t.from && x.to_member === t.to && x.amount_cents === t.cents);
    if (hit) used.add(hit.id);
    return { ...t, settlementId: hit?.id ?? null };
  });
}
