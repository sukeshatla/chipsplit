import { settle } from '../lib/settle';
import { splitEqual } from '../lib/money';
import type { AppData, ChangeLogEntry, Contact, Expense, GameSession, Group, Member, Profile, Settlement } from '../lib/types';

/** A stand-in id: Ravi is the one demo friend who's "already signed up", so the demo can show
 *  a Friend badge (not just Invited/Guest) and a history/notification entry with a real name. */
const RAVI_USER_ID = 'demo-ravi';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Sample data so the demo feels real. Dates are relative to today. */
export function seedDemo(): AppData {
  const me: Profile = {
    id: 'demo-user', display_name: 'Suki', email: 'suki@example.com',
    avatar_url: null, default_currency: 'USD',
    notifications_seen_at: `${daysAgo(160)}T12:00:00Z`,
  };

  // One contact per person, reused across every group so they appear once on the Friends page.
  const contacts = new Map<string, Contact>();
  const contactId = (n: string): string | null => {
    if (n === 'Suki') return null;
    let c = contacts.get(n);
    if (!c) {
      c = { id: uid(), owner_id: me.id, user_id: n === 'Ravi' ? RAVI_USER_ID : null, name: n, email: `${n.toLowerCase()}@example.com`, created_at: `${daysAgo(160)}T12:00:00Z` };
      contacts.set(n, c);
    }
    return c.id;
  };

  const makeGroup = (name: string, kind: Group['kind'], names: string[], age: number): Group => {
    const id = uid();
    const members: Member[] = names.map((n) => ({
      id: uid(), group_id: id, user_id: n === 'Suki' ? me.id : n === 'Ravi' ? RAVI_USER_ID : null, contact_id: contactId(n), name: n,
      email: `${n.toLowerCase()}@example.com`, email_opt_out: false, is_admin: true,
    }));
    return { id, name, kind, currency: 'USD', created_by: me.id, created_at: `${daysAgo(age)}T12:00:00Z`, members, expenses: [], deleted_expenses: [], sessions: [], settlements: [] };
  };
  const mid = (g: Group, n: string) => g.members.find((m) => m.name === n)!.id;

  const pay = (g: Group, from: string, to: string, dollars: number, ago: number, method = 'Zelle', sessionId: string | null = null): Settlement => ({
    id: uid(), group_id: g.id, from_member: mid(g, from), to_member: mid(g, to), amount_cents: Math.round(dollars * 100),
    method, note: null, session_id: sessionId, settled_on: daysAgo(ago), created_at: `${daysAgo(ago)}T20:00:00Z`,
  });

  // ---- Club ----
  const club = makeGroup('Friday club', 'club', ['Suki', 'Ravi', 'Kiran', 'Ajay', 'Vamsi', 'Teja'], 160);
  const nights: [number, string, Record<string, [number, number]>, 'final' | 'open', 'all' | 'some' | 'none'][] = [
    [150, "Ravi's place", { Suki: [100, 60], Ravi: [100, 180], Kiran: [100, 140], Ajay: [100, 20] }, 'final', 'all'],
    [120, "Kiran's place", { Suki: [100, 210], Ravi: [150, 90], Kiran: [100, 100], Ajay: [100, 50], Vamsi: [100, 100] }, 'final', 'all'],
    [90, "Suki's place", { Suki: [100, 40], Ravi: [100, 160], Ajay: [200, 250], Teja: [100, 50] }, 'final', 'all'],
    [60, "Ajay's place", { Suki: [100, 230], Kiran: [100, 80], Ajay: [150, 60], Vamsi: [100, 110], Teja: [100, 70] }, 'final', 'all'],
    [33, "Vamsi's place", { Suki: [100, 90], Ravi: [100, 150], Kiran: [100, 120], Ajay: [100, 40] }, 'final', 'all'],
    [9, "Suki's place", { Suki: [100, 220], Ravi: [100, 20], Kiran: [100, 160], Ajay: [200, 100], Vamsi: [100, 140], Teja: [100, 60] }, 'final', 'some'],
    [1, "Teja's place", { Suki: [50, 0], Ravi: [50, 0], Kiran: [100, 0], Teja: [50, 0] }, 'open', 'none'],
  ];
  for (const [ago, location, table, status, paid] of nights) {
    const s: GameSession = {
      id: uid(), group_id: club.id, played_on: daysAgo(ago), location, notes: null, status,
      // Ravi hosted the night at his place (so the demo shows a game you can only view); you hosted the rest.
      default_buy_in_cents: 5000, created_by: location.startsWith('Ravi') ? RAVI_USER_ID : me.id, created_at: `${daysAgo(ago)}T19:00:00Z`,
      results: Object.entries(table).map(([n, [i, o]]) => ({ member_id: mid(club, n), buy_in_cents: i * 100, cash_out_cents: o * 100 })),
    };
    club.sessions.push(s);
    if (paid === 'none') continue;
    const transfers = settle(s.results.map((r) => ({ id: r.member_id, cents: r.cash_out_cents - r.buy_in_cents })));
    const toPay = paid === 'all' ? transfers : transfers.slice(0, 1);
    for (const t of toPay) {
      club.settlements.push({
        id: uid(), group_id: club.id, from_member: t.from, to_member: t.to, amount_cents: t.cents,
        method: 'Cash', note: null, session_id: s.id, settled_on: daysAgo(Math.max(ago - 1, 0)),
        created_at: `${daysAgo(Math.max(ago - 1, 0))}T10:00:00Z`,
      });
    }
  }

  // ---- Trip ----
  const trip = makeGroup('Goa trip', 'expenses', ['Suki', 'Ravi', 'Kiran', 'Vamsi'], 50);
  const exp = (g: Group, description: string, category: string, dollars: number, payer: string, among: string[], ago: number): Expense => {
    const cents = Math.round(dollars * 100);
    return {
      id: uid(), group_id: g.id, description, category, amount_cents: cents, spent_on: daysAgo(ago),
      created_by: me.id, created_at: `${daysAgo(ago)}T09:00:00Z`,
      payers: [{ member_id: mid(g, payer), amount_cents: cents }],
      shares: splitEqual(cents, among.map((n) => mid(g, n))),
    };
  };
  const all4 = ['Suki', 'Ravi', 'Kiran', 'Vamsi'];
  trip.expenses.push(
    exp(trip, 'Beach villa', 'lodging', 640, 'Suki', all4, 45),
    exp(trip, 'Scooter rentals', 'transport', 120, 'Ravi', all4, 44),
    exp(trip, 'Seafood dinner', 'food', 210, 'Kiran', all4, 43),
    exp(trip, 'Parasailing', 'fun', 180, 'Vamsi', ['Suki', 'Ravi', 'Vamsi'], 42),
  );
  trip.settlements.push(pay(trip, 'Ravi', 'Suki', 100, 30, 'Venmo'));

  // ---- Home ----
  const home = makeGroup('Roommates', 'expenses', ['Suki', 'Kiran', 'Teja'], 100);
  const three = ['Suki', 'Kiran', 'Teja'];
  home.expenses.push(
    exp(home, 'Rent', 'housing', 2400, 'Suki', three, 27),
    exp(home, 'Internet', 'utilities', 75, 'Kiran', three, 20),
    exp(home, 'Groceries', 'food', 96.3, 'Teja', three, 6),
    exp(home, 'Cleaning supplies', 'household', 38.5, 'Suki', three, 3),
  );
  home.settlements.push(pay(home, 'Kiran', 'Suki', 775, 18), pay(home, 'Teja', 'Suki', 800, 16));

  // A friend added straight to the address book, not part of any group yet.
  contacts.set('Meera', { id: uid(), owner_id: me.id, user_id: null, name: 'Meera', email: null, created_at: `${daysAgo(5)}T12:00:00Z` });

  // ---- One-on-one with Ajay, outside any group (Quick add / a friend's page) ----
  const withAjay = { ...makeGroup('Ajay', 'expenses', ['Suki', 'Ajay'], 12), is_direct: true };
  withAjay.expenses.push(exp(withAjay, 'Movie tickets', 'fun', 36, 'Suki', ['Suki', 'Ajay'], 4));

  return { me, groups: [club, trip, home, withAjay], contacts: [...contacts.values()] };
}

/** A few recent, plausible history entries -- all from Ravi, the one demo friend who's "signed
 *  up" -- so the notifications bell and each group's History tab aren't empty on first look. */
export function seedChangeLog(data: AppData): ChangeLogEntry[] {
  const club = data.groups.find((g) => g.kind === 'club')!;
  const trip = data.groups.find((g) => g.name === 'Goa trip')!;
  const openSession = club.sessions.find((s) => s.status === 'open')!;
  const entry = (groupId: string, entityType: ChangeLogEntry['entity_type'], entityId: string | null, summary: string, ago: number, hour: string): ChangeLogEntry => ({
    id: uid(), group_id: groupId, actor_id: RAVI_USER_ID, entity_type: entityType, entity_id: entityId, summary, created_at: `${daysAgo(ago)}T${hour}:00Z`,
  });
  return [
    entry(club.id, 'session', openSession.id, `Started a game at ${openSession.location}`, 1, '19:00'),
    entry(club.id, 'settlement', null, 'Recorded a payment: Ravi → Suki', 3, '10:05'),
    entry(trip.id, 'expense', null, 'Added expense "Scooter rentals"', 44, '09:20'),
  ];
}
