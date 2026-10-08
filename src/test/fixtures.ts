// Small builders for tests: just enough of each record to state a rule, with everything else
// defaulted. Amounts are cents.
import type { AppData, Expense, GameSession, Group, Member, SessionResult, Settlement } from '../lib/types';

export const ME = 'me-user';

export function member(id: string, extra: Partial<Member> = {}): Member {
  return { id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: false, ...extra };
}

/** You, as a member of a group (linked to ME). */
export function meMember(id = 'm-me', extra: Partial<Member> = {}): Member {
  return member(id, { user_id: ME, name: 'Me', is_admin: true, ...extra });
}

export function group(extra: Partial<Group> = {}): Group {
  return {
    id: 'g', name: 'Group', kind: 'expenses', currency: 'USD', created_by: ME, created_at: '2026-01-01T00:00:00Z',
    members: [], expenses: [], deleted_expenses: [], sessions: [], deleted_sessions: [], settlements: [], ...extra,
  };
}

/** `payer` paid `cents`, split evenly-by-hand between `shares` (member id → cents). */
export function expense(id: string, payer: string, cents: number, shares: Record<string, number>, extra: Partial<Expense> = {}): Expense {
  return {
    id, group_id: 'g', description: id, category: 'general', amount_cents: cents, spent_on: '2026-01-01', created_by: null, created_at: '2026-01-01T00:00:00Z',
    payers: [{ member_id: payer, amount_cents: cents }],
    shares: Object.entries(shares).map(([member_id, amount_cents]) => ({ member_id, amount_cents })),
    ...extra,
  };
}

/** A finished game. `results`: member id → [buy-in, cash-out]. */
export function game(id: string, results: Record<string, [number, number]>, extra: Partial<GameSession> = {}): GameSession {
  const rows: SessionResult[] = Object.entries(results).map(([member_id, [buy_in_cents, cash_out_cents]]) => ({ member_id, buy_in_cents, cash_out_cents }));
  return { id, group_id: 'g', played_on: '2026-01-01', location: null, notes: null, status: 'final', default_buy_in_cents: 1000, created_by: ME, created_at: '2026-01-01T00:00:00Z', results: rows, ...extra };
}

export function payment(id: string, from: string, to: string, cents: number, extra: Partial<Settlement> = {}): Settlement {
  return { id, group_id: 'g', from_member: from, to_member: to, amount_cents: cents, method: null, note: null, session_id: null, settled_on: '2026-01-02', created_at: '2026-01-02T00:00:00Z', ...extra };
}

export function data(groups: Group[], extra: Partial<AppData> = {}): AppData {
  return {
    me: { id: ME, display_name: 'Me', email: 'me@example.com', avatar_url: null, default_currency: 'USD', notifications_seen_at: '' },
    groups, contacts: [], ...extra,
  };
}
