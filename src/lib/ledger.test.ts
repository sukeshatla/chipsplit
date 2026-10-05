import { describe, expect, it } from 'vitest';
import { settle } from './settle';
import { splitByWeights, splitEqual, parseMoney, equalPercents } from './money';
import { groupBalances, simplify, isGroupAdmin, isGroupSettled, isSessionSettled, notificationLink, shortName, listedGroups, directFriendKey, activity, resultNet, sessionTotals, isGameHost, totals, friendBalances } from './ledger';
import type { AppData, GameSession, Group } from './types';

describe('settle', () => {
  it('settles the sample game in 4 payments', () => {
    const t = settle([
      { id: 'suki', cents: 12000 }, { id: 'ravi', cents: -8000 }, { id: 'kiran', cents: 6000 },
      { id: 'ajay', cents: -10000 }, { id: 'vamsi', cents: 4000 }, { id: 'teja', cents: -4000 },
    ]);
    expect(t).toEqual([
      { from: 'ajay', to: 'suki', cents: 10000 },
      { from: 'ravi', to: 'suki', cents: 2000 },
      { from: 'ravi', to: 'kiran', cents: 6000 },
      { from: 'teja', to: 'vamsi', cents: 4000 },
    ]);
  });
  it('returns nothing when everyone is even', () => {
    expect(settle([{ id: 'a', cents: 0 }, { id: 'b', cents: 0 }])).toEqual([]);
  });
  it('clears every balance', () => {
    const input = [{ id: 'a', cents: 3333 }, { id: 'b', cents: -1111 }, { id: 'c', cents: -2222 }];
    const bal = new Map(input.map((x) => [x.id, x.cents]));
    for (const t of settle(input)) {
      bal.set(t.from, bal.get(t.from)! + t.cents);
      bal.set(t.to, bal.get(t.to)! - t.cents);
    }
    expect([...bal.values()].every((v) => v === 0)).toBe(true);
  });
});

describe('money', () => {
  it('splits evenly with exact cents', () => {
    const s = splitEqual(1000, ['a', 'b', 'c']);
    expect(s.map((x) => x.amount_cents)).toEqual([334, 333, 333]);
  });
  it('splits by percentage exactly', () => {
    const s = splitByWeights(10001, [{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }]);
    expect(s.reduce((a, x) => a + x.amount_cents, 0)).toBe(10001);
  });
  it('parses money strings', () => {
    expect(parseMoney('$1,250.50')).toBe(125050);
    expect(parseMoney('')).toBeNull();
  });
  it('defaults percentages to sum to exactly 100', () => {
    for (const n of [1, 2, 3, 4, 7]) {
      const pcts = equalPercents(n);
      expect(pcts).toHaveLength(n);
      expect(pcts.reduce((a, p) => a + Number(p), 0)).toBeCloseTo(100, 5);
    }
    expect(equalPercents(0)).toEqual([]);
  });
});

describe('groupBalances', () => {
  const g: Group = {
    id: 'g', name: 'Test', kind: 'club', currency: 'USD', created_by: null, created_at: '',
    members: ['a', 'b', 'c'].map((id) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true })),
    expenses: [{
      id: 'e', group_id: 'g', description: 'Pizza', category: 'food', amount_cents: 9000, spent_on: '2026-01-01',
      created_by: null, created_at: '', payers: [{ member_id: 'a', amount_cents: 9000 }],
      shares: splitEqual(9000, ['a', 'b', 'c']),
    }],
    sessions: [{
      id: 's', group_id: 'g', played_on: '2026-01-01', location: null, notes: null, status: 'final',
      default_buy_in_cents: 5000, created_at: '',
      results: [
        { member_id: 'a', buy_in_cents: 5000, cash_out_cents: 2000 },
        { member_id: 'b', buy_in_cents: 5000, cash_out_cents: 8000 },
      ],
    }],
    settlements: [{ id: 'p', group_id: 'g', from_member: 'c', to_member: 'a', amount_cents: 3000, method: null, note: null, session_id: null, settled_on: '2026-01-02', created_at: '' }],
  };
  it('combines expenses, poker, and payments', () => {
    const b = groupBalances(g);
    expect(b.get('a')).toBe(6000 - 3000 - 3000);
    expect(b.get('b')).toBe(-3000 + 3000);
    expect(b.get('c')).toBe(-3000 + 3000);
    expect(simplify(b)).toEqual([]);
  });
});

describe('friendBalances', async () => {
  const { seedDemo } = await import('../api/seed');
  const { friendBalances, totals } = await import('./ledger');
  it('merges a guest who is in several groups into one friend', () => {
    const data = seedDemo();
    const names = friendBalances(data).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('friend totals match the sum of your group balances', () => {
    const data = seedDemo();
    const sum = data.groups.reduce((a, g) => {
      const mine = g.members.find((m) => m.user_id === data.me.id)!.id;
      return a + (groupBalances(g).get(mine) ?? 0);
    }, 0);
    expect(totals(data).net).toBe(sum);
  });
});

describe('isGroupAdmin', () => {
  const g: Group = {
    id: 'g', name: 'Test', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
    members: [
      { id: 'a', group_id: 'g', user_id: 'u-a', contact_id: null, name: 'A', email: null, email_opt_out: false, is_admin: true },
      { id: 'b', group_id: 'g', user_id: 'u-b', contact_id: null, name: 'B', email: null, email_opt_out: false, is_admin: false },
    ],
    expenses: [], sessions: [], settlements: [],
  };
  it('is true only for a linked, admin member', () => {
    expect(isGroupAdmin(g, 'u-a')).toBe(true);
    expect(isGroupAdmin(g, 'u-b')).toBe(false);
    expect(isGroupAdmin(g, 'u-nobody')).toBe(false);
  });
});

describe('isGroupSettled', () => {
  const member = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true });
  it('is false while an expense is unpaid back', () => {
    const g: Group = {
      id: 'g', name: 'Test', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
      members: ['a', 'b'].map(member),
      expenses: [{
        id: 'e', group_id: 'g', description: 'Dinner', category: 'food', amount_cents: 2000, spent_on: '2026-01-01',
        created_by: null, created_at: '', payers: [{ member_id: 'a', amount_cents: 2000 }],
        shares: splitEqual(2000, ['a', 'b']),
      }],
      sessions: [], settlements: [],
    };
    expect(isGroupSettled(g)).toBe(false);
  });
  it('is true once a settlement squares it up', () => {
    const g: Group = {
      id: 'g', name: 'Test', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
      members: ['a', 'b'].map(member),
      expenses: [{
        id: 'e', group_id: 'g', description: 'Dinner', category: 'food', amount_cents: 2000, spent_on: '2026-01-01',
        created_by: null, created_at: '', payers: [{ member_id: 'a', amount_cents: 2000 }],
        shares: splitEqual(2000, ['a', 'b']),
      }],
      sessions: [],
      settlements: [{ id: 's', group_id: 'g', from_member: 'b', to_member: 'a', amount_cents: 1000, method: null, note: null, session_id: null, settled_on: '2026-01-02', created_at: '' }],
    };
    expect(isGroupSettled(g)).toBe(true);
  });
});

describe('isSessionSettled', () => {
  const member = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true });
  const baseGroup: Omit<Group, 'members' | 'sessions' | 'settlements'> = { id: 'g', name: 'Test', kind: 'club', currency: 'USD', created_by: null, created_at: '', expenses: [] };
  const session = { id: 's', group_id: 'g', played_on: '2026-01-01', location: null, notes: null, status: 'final' as const, default_buy_in_cents: 5000, created_at: '',
    results: [{ member_id: 'a', buy_in_cents: 5000, cash_out_cents: 8000 }, { member_id: 'b', buy_in_cents: 5000, cash_out_cents: 2000 }] };
  it('is always settled while the game is still open, regardless of balances', () => {
    const g: Group = { ...baseGroup, members: ['a', 'b'].map(member), sessions: [{ ...session, status: 'open' }], settlements: [] };
    expect(isSessionSettled(g, g.sessions[0]!)).toBe(true);
  });
  it('is false for a finalized game with no settlement recorded', () => {
    const g: Group = { ...baseGroup, members: ['a', 'b'].map(member), sessions: [session], settlements: [] };
    expect(isSessionSettled(g, session)).toBe(false);
  });
  it('is true once a settlement tied to that session squares it up', () => {
    const g: Group = {
      ...baseGroup, members: ['a', 'b'].map(member), sessions: [session],
      settlements: [{ id: 'p', group_id: 'g', from_member: 'b', to_member: 'a', amount_cents: 3000, method: null, note: null, session_id: 's', settled_on: '2026-01-02', created_at: '' }],
    };
    expect(isSessionSettled(g, session)).toBe(true);
  });
  it('ignores a settlement recorded for a different session', () => {
    const g: Group = {
      ...baseGroup, members: ['a', 'b'].map(member), sessions: [session],
      settlements: [{ id: 'p', group_id: 'g', from_member: 'b', to_member: 'a', amount_cents: 3000, method: null, note: null, session_id: 'other', settled_on: '2026-01-02', created_at: '' }],
    };
    expect(isSessionSettled(g, session)).toBe(false);
  });
});

describe('notificationLink', () => {
  it('routes each entity type to the right tab', () => {
    const base = { id: '1', group_id: 'g', actor_id: null, entity_id: null, summary: '', created_at: '' } as const;
    expect(notificationLink({ ...base, entity_type: 'expense' })).toBe('/groups/g?tab=expenses');
    expect(notificationLink({ ...base, entity_type: 'expense', entity_id: 'e1' })).toBe('/groups/g?tab=expenses&expense=e1');
    expect(notificationLink({ ...base, entity_type: 'settlement' })).toBe('/groups/g?tab=balances');
    expect(notificationLink({ ...base, entity_type: 'member' })).toBe('/groups/g?tab=members');
    expect(notificationLink({ ...base, entity_type: 'session' })).toBe('/groups/g?tab=games');
    expect(notificationLink({ ...base, entity_type: 'session', entity_id: 's1' })).toBe('/groups/g/games/s1');
  });
});

describe('summaryMailto', async () => {
  const { summaryMailto } = await import('./ledger');
  const g: Group = {
    id: 'g', name: 'Roommates', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
    members: [
      { id: 'a', group_id: 'g', user_id: null, contact_id: null, name: 'Ana', email: 'ana@x.com', email_opt_out: false, is_admin: true },
      { id: 'b', group_id: 'g', user_id: null, contact_id: null, name: 'Bo', email: 'bo@x.com', email_opt_out: true, is_admin: false },
      { id: 'c', group_id: 'g', user_id: null, contact_id: null, name: 'Cy', email: null, email_opt_out: false, is_admin: false },
    ],
    expenses: [{
      id: 'e', group_id: 'g', description: 'Rent', category: 'housing', amount_cents: 3000, spent_on: '2026-01-01',
      created_by: null, created_at: '', payers: [{ member_id: 'a', amount_cents: 3000 }],
      shares: splitEqual(3000, ['a', 'b', 'c']),
    }],
    sessions: [], settlements: [],
  };
  it('only includes recipients with an email who have not opted out', () => {
    const url = summaryMailto(g);
    expect(url.startsWith('mailto:ana%40x.com')).toBe(true);
    expect(url).not.toContain('bo%40x.com');
    expect(url).not.toContain('cy%40x.com');
  });
  it('names everyone with a nonzero balance in the body', () => {
    const url = summaryMailto(g);
    const body = decodeURIComponent(url.split('body=')[1]!);
    expect(body).toContain('Ana');
    expect(body).toContain('Bo');
    expect(body).toContain('Cy');
  });
});

describe('summaryData', async () => {
  const { summaryData } = await import('./ledger');
  const mem = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id.toUpperCase(), email: `${id}@x.com`, email_opt_out: false, is_admin: true });
  const res = (member_id: string, buy_in_cents: number, cash_out_cents: number) => ({ id: member_id, session_id: 's', member_id, buy_in_cents, cash_out_cents, returned_cents: 0 });
  const g = {
    id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '',
    members: ['a', 'b', 'c', 'd'].map(mem), expenses: [], settlements: [],
    sessions: [{ id: 's', group_id: 'g', played_on: '2026-10-03', location: 'Ravi\'s', notes: null, status: 'final', default_buy_in_cents: 5000, created_at: '',
      results: [res('a', 5000, 8000), res('b', 5000, 2000), res('c', 0, 0)] }],
  } as unknown as Group;
  it('a game covers only the people who played, with its date and place', () => {
    const d = summaryData(g, 's');
    expect(d.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(d.recipients).toEqual(['a@x.com', 'b@x.com']);
    expect(d.place).toBe("Ravi's");
  });
  it('marks a game payment paid once it is recorded', () => {
    expect(summaryData(g, 's').transfers).toEqual([{ from: 'b', to: 'a', cents: 3000, paid: false }]);
    const paid = { ...g, settlements: [{ id: 'p', group_id: 'g', from_member: 'b', to_member: 'a', amount_cents: 3000, session_id: 's' }] } as unknown as Group;
    expect(summaryData(paid, 's').transfers).toEqual([{ from: 'b', to: 'a', cents: 3000, paid: true }]);
  });
  it('a group covers every member, settled or not', () => {
    const d = summaryData(g);
    expect(d.rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(d.recipients).toHaveLength(4);
    expect(d.place).toBeNull();
  });
});

describe('gameTableData', async () => {
  const { gameTableData } = await import('./ledger');
  it('counts buy-ins (first included) and chips given back, and what is left in the pot', () => {
    const mem = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id.toUpperCase(), email: null, email_opt_out: false, is_admin: true });
    const g = { id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: ['a', 'b'].map(mem), expenses: [], settlements: [], sessions: [] } as unknown as Group;
    const s = { id: 's', played_on: '2026-10-04', location: null, status: 'open', default_buy_in_cents: 5000 } as GameSession;
    const d = gameTableData(g, s, [
      { member_id: 'a', buy_in_cents: 5000, cash_out_cents: 0, returned_cents: 0 },
      { member_id: 'b', buy_in_cents: 10000, cash_out_cents: 0, returned_cents: 2000 },
    ]);
    expect(d.rows.map((r) => [r.id, r.buyIns, r.back])).toEqual([['b', 2, 2000], ['a', 1, 0]]);
    expect(d.live).toEqual({ final: false, buyInAmount: 5000, totalIn: 15000, buyIns: 3, totalBack: 2000, totalCashOut: 0, pot: 13000 });
    expect(d.transfers).toEqual([]);
  });
});

describe('gameTableData order', async () => {
  const { gameTableData } = await import('./ledger');
  it('puts winners first, then players still in, then even, then losers', () => {
    const mem = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true });
    const g = { id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: ['w1', 'w2', 'p', 'e', 'l1', 'l2'].map(mem), expenses: [], settlements: [], sessions: [] } as unknown as Group;
    const s = { id: 's', played_on: '2026-10-04', location: null, status: 'open', default_buy_in_cents: 500 } as GameSession;
    const row = (member_id: string, buy_in_cents: number, cash_out_cents: number) => ({ member_id, buy_in_cents, cash_out_cents, returned_cents: 0 });
    const d = gameTableData(g, s, [row('l2', 1000, 200), row('p', 1500, 0), row('w1', 500, 900), row('e', 500, 500), row('w2', 500, 1500), row('l1', 500, 400)]);
    expect(d.rows.map((r) => r.id)).toEqual(['w2', 'w1', 'p', 'e', 'l1', 'l2']);
  });
});

describe('gameTableData, finished game', async () => {
  const { gameTableData } = await import('./ledger');
  it('ranks everyone by net, drops sat-out rows, and lists payments with paid marks', () => {
    const mem = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true });
    const s = { id: 's', played_on: '2026-10-04', location: null, status: 'final', default_buy_in_cents: 500, results: [] } as unknown as GameSession;
    const row = (member_id: string, buy_in_cents: number, cash_out_cents: number) => ({ member_id, buy_in_cents, cash_out_cents, returned_cents: 0 });
    const results = [row('a', 500, 0), row('b', 500, 1000), row('c', 0, 0)];
    const g = { id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: ['a', 'b', 'c'].map(mem), expenses: [],
      sessions: [{ ...s, results }], settlements: [{ id: 'p', group_id: 'g', from_member: 'a', to_member: 'b', amount_cents: 500, session_id: 's' }] } as unknown as Group;
    const d = gameTableData(g, g.sessions[0]!, results);
    expect(d.rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(d.live?.final).toBe(true);
    expect(d.transfers).toEqual([{ from: 'a', to: 'b', cents: 500, paid: true }]);
  });
});

describe('reminderMailto', async () => {
  const { reminderMailto } = await import('./ledger');
  const g: Group = {
    id: 'g', name: 'Roommates', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
    members: [
      { id: 'a', group_id: 'g', user_id: null, contact_id: null, name: 'Ana', email: 'ana@x.com', email_opt_out: false, is_admin: true },
      { id: 'c', group_id: 'g', user_id: null, contact_id: null, name: 'Cy', email: null, email_opt_out: false, is_admin: false },
    ],
    expenses: [], sessions: [], settlements: [],
  };
  it('addresses the debtor directly and mentions who they owe and how much', () => {
    const url = reminderMailto(g, { from: 'a', to: 'c', cents: 1500 });
    expect(url).not.toBeNull();
    expect(url!.startsWith('mailto:ana%40x.com')).toBe(true);
    const body = decodeURIComponent(url!.split('body=')[1]!);
    expect(body).toContain('Ana');
    expect(body).toContain('Cy');
    expect(body).toContain('$15');
  });
  it('returns null when the debtor has no email on file', () => {
    expect(reminderMailto(g, { from: 'c', to: 'a', cents: 1500 })).toBeNull();
  });
});

describe('friendsList', async () => {
  const { seedDemo } = await import('../api/seed');
  const { friendsList, friendBalances, friendKey, statusFromKey } = await import('./ledger');
  it('includes a contact who is not in any shared group yet', () => {
    const data = seedDemo();
    const meera = friendsList(data).find((f) => f.name === 'Meera');
    expect(meera).toMatchObject({ net: 0, groups: [], status: 'guest' });
  });
  it('does not duplicate a friend who is both a contact and a group co-member', () => {
    const data = seedDemo();
    const rows = friendsList(data);
    const keys = rows.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Ravi is in two groups and also a seeded contact; he must collapse into one row.
    const ravi = data.contacts.find((c) => c.name === 'Ravi')!;
    const row = rows.find((f) => f.key === friendKey(ravi));
    expect(row?.contactId).toBe(ravi.id);
    expect(row?.groups.length).toBeGreaterThan(1);
  });
  it('every friendBalances entry is present in friendsList with the same balance', () => {
    const data = seedDemo();
    const rows = new Map(friendsList(data).map((f) => [f.key, f]));
    for (const f of friendBalances(data)) {
      expect(rows.get(f.key)?.net).toBe(f.net);
    }
  });
  it('classifies status from the key prefix', () => {
    expect(statusFromKey('u:1')).toBe('friend');
    expect(statusFromKey('e:a@b.com')).toBe('invited');
    expect(statusFromKey('m:123')).toBe('guest');
  });
  it('merges a friend added by email with a same-email guest in a group, before either signs up', () => {
    // This is the exact "added as a friend by email, also a group guest" case that must not
    // show up twice on the Friends page.
    const data: AppData = {
      me: { id: 'me', display_name: 'Me', email: 'me@x.com', avatar_url: null, default_currency: 'USD', notifications_seen_at: '' },
      contacts: [{ id: 'c1', owner_id: 'me', user_id: null, name: 'Ravi', email: 'RAVI@x.com', created_at: '' }],
      groups: [{
        id: 'g', name: 'Trip', kind: 'expenses', currency: 'USD', created_by: 'me', created_at: '',
        members: [
          { id: 'm-me', group_id: 'g', user_id: 'me', contact_id: null, name: 'Me', email: 'me@x.com', email_opt_out: false, is_admin: true },
          { id: 'm-ravi', group_id: 'g', user_id: null, contact_id: null, name: 'Ravi', email: 'ravi@x.com', email_opt_out: false, is_admin: true },
        ],
        expenses: [], sessions: [], settlements: [],
      }],
    };
    const rows = friendsList(data).filter((f) => f.name === 'Ravi');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contactId).toBe('c1');
  });
});

describe('shortName', () => {
  it('keeps the first name and the last name initial', () => {
    expect(shortName('Srinath Pinnaka')).toBe('Srinath P.');
    expect(shortName('Jagan Mohan Rao')).toBe('Jagan R.');
  });
  it('leaves single names alone', () => {
    expect(shortName('Rakesh')).toBe('Rakesh');
    expect(shortName('  Sindhu ')).toBe('Sindhu');
  });
  it('falls back to the full name when two people would shorten the same way', () => {
    const others = ['Srinath Pinnaka', 'Srinath Patel', 'Srija Poreddy'];
    expect(shortName('Srinath Pinnaka', others)).toBe('Srinath Pinnaka');
    expect(shortName('Srija Poreddy', others)).toBe('Srija P.');
  });
});

describe('direct (friend-only) groups', () => {
  const me = { id: 'me', display_name: 'Me', email: 'me@x.com', avatar_url: null, default_currency: 'USD', notifications_seen_at: '' };
  const mem = (id: string, userId: string | null, name: string) => ({ id, group_id: 'd', user_id: userId, contact_id: null, name, email: `${name.toLowerCase()}@x.com`, email_opt_out: false, is_admin: true });
  const direct: Group = {
    id: 'd', name: 'Kiran', kind: 'expenses', is_direct: true, currency: 'USD', created_by: 'me', created_at: '',
    members: [mem('m1', 'me', 'Me'), mem('m2', null, 'Kiran')], sessions: [], settlements: [],
    expenses: [{ id: 'e1', group_id: 'd', description: 'Coffee', category: 'food', amount_cents: 1200, spent_on: '2026-10-02', created_by: 'me', created_at: '',
      payers: [{ member_id: 'm1', amount_cents: 1200 }], shares: [{ member_id: 'm1', amount_cents: 600 }, { member_id: 'm2', amount_cents: 600 }] }],
  };
  const club: Group = { ...direct, id: 'c', name: 'Club', kind: 'club', is_direct: false, expenses: [] };
  const data: AppData = { me, groups: [club, direct], contacts: [] };

  it('leaves direct groups out of Groups lists', () => {
    expect(listedGroups(data).map((g) => g.id)).toEqual(['c']);
  });
  it('points one-on-one activity at the friend page', () => {
    expect(directFriendKey(direct, 'me')).toBe('e:kiran@x.com');
    expect(directFriendKey(club, 'me')).toBeNull();
    expect(activity(data).find((a) => a.id === 'e1')!.link).toBe('/friends/e%3Akiran%40x.com?expense=e1');
  });
});

describe('group vs game settlement', () => {
  // A finalized game (a +30, b -30) and an expense (a paid 20, split evenly: a +10, b -10).
  // b settles the whole $40 from the Balances tab, so the payment isn't tied to the game.
  const mem = (id: string) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: true });
  const game: GameSession = { id: 's', group_id: 'g', played_on: '2026-10-01', location: null, notes: null, status: 'final', default_buy_in_cents: 5000, created_at: '',
    results: [{ member_id: 'a', buy_in_cents: 5000, cash_out_cents: 8000 }, { member_id: 'b', buy_in_cents: 5000, cash_out_cents: 2000 }] };
  const g: Group = {
    id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: [mem('a'), mem('b')], sessions: [game],
    expenses: [{ id: 'e', group_id: 'g', description: 'Pizza', category: 'food', amount_cents: 2000, spent_on: '2026-10-01', created_by: null, created_at: '',
      payers: [{ member_id: 'a', amount_cents: 2000 }], shares: [{ member_id: 'a', amount_cents: 1000 }, { member_id: 'b', amount_cents: 1000 }] }],
    settlements: [{ id: 'p', group_id: 'g', from_member: 'b', to_member: 'a', amount_cents: 4000, method: null, note: null, session_id: null, settled_on: '2026-10-02', created_at: '' }],
  };

  it('balances count finalized games and expenses together', () => {
    const before = groupBalances({ ...g, settlements: [] });
    expect(before.get('a')).toBe(4000);
    expect(before.get('b')).toBe(-4000);
  });
  it('a group settled in total can be deleted even though the game itself shows unpaid', () => {
    expect(isGroupSettled(g)).toBe(true);
    expect(isSessionSettled(g, game)).toBe(false);
  });
  it('an open game does not count toward balances yet', () => {
    const open = groupBalances({ ...g, sessions: [{ ...game, status: 'open' }], settlements: [] });
    expect(open.get('a')).toBe(1000);
  });
});

describe('chips given back mid-game', () => {
  // a buys 100, sells 40 of chips back to the bank, ends with 80; b buys 100 + the 40 a gave back, ends with 120.
  const s: GameSession = { id: 's', group_id: 'g', played_on: '', location: null, notes: null, status: 'final', default_buy_in_cents: 10000, created_at: '',
    results: [{ member_id: 'a', buy_in_cents: 10000, cash_out_cents: 8000, returned_cents: 4000 }, { member_id: 'b', buy_in_cents: 14000, cash_out_cents: 12000 }] };
  it('counts given-back chips as cash already taken out', () => {
    expect(resultNet(s.results[0]!)).toBe(2000);
    expect(resultNet(s.results[1]!)).toBe(-2000);
  });
  it('balances the table with given-back chips on the out side', () => {
    expect(sessionTotals(s)).toEqual({ buyIn: 24000, cashOut: 24000, diff: 0 });
  });
  it('treats a missing amount as nothing given back', () => {
    expect(resultNet({ member_id: 'x', buy_in_cents: 500, cash_out_cents: 700 })).toBe(200);
  });
});

describe('game host', () => {
  const mem = (id: string, userId: string | null, admin: boolean) => ({ id, group_id: 'g', user_id: userId, contact_id: null, name: id, email: null, email_opt_out: false, is_admin: admin });
  const g: Group = { id: 'g', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: [mem('a', 'ua', true), mem('b', 'ub', false)], expenses: [], sessions: [], settlements: [] };
  const game = (created_by: string | null): GameSession => ({ id: 's', group_id: 'g', played_on: '', location: null, notes: null, status: 'open', default_buy_in_cents: 0, created_by, created_at: '', results: [] });
  it('only the person who started a game hosts it', () => {
    expect(isGameHost(g, game('ub'), 'ub')).toBe(true);
    expect(isGameHost(g, game('ub'), 'ua')).toBe(false); // not even an admin
  });
  it('falls back to group admins for old games with no recorded host', () => {
    expect(isGameHost(g, game(null), 'ua')).toBe(true);
    expect(isGameHost(g, game(null), 'ub')).toBe(false);
  });
});

describe('balances in more than one currency', () => {
  const me = { id: 'me', display_name: 'Me', email: 'me@x.com', avatar_url: null, default_currency: 'USD', notifications_seen_at: '' };
  const mem = (gid: string, id: string, userId: string | null, name: string) => ({ id, group_id: gid, user_id: userId, contact_id: null, name, email: 'j@x.com', email_opt_out: false, is_admin: true });
  const lend = (gid: string, id: string, payer: string, ower: string, cents: number) => ({ id, group_id: gid, description: id, category: 'general', amount_cents: cents, spent_on: '2026-01-01', created_by: null, created_at: '',
    payers: [{ member_id: payer, amount_cents: cents }], shares: [{ member_id: ower, amount_cents: cents }] });
  // Jagan owes you $20 in a USD club and ₹58,184 one-on-one.
  const club: Group = { id: 'c', name: 'Club', kind: 'club', currency: 'USD', created_by: null, created_at: '', members: [mem('c', 'c1', 'me', 'Me'), mem('c', 'c2', null, 'Jagan')], sessions: [], settlements: [], expenses: [lend('c', 'e1', 'c1', 'c2', 2000)] };
  const inr: Group = { id: 'd', name: 'Jagan', kind: 'expenses', is_direct: true, currency: 'INR', created_by: null, created_at: '', members: [mem('d', 'd1', 'me', 'Me'), mem('d', 'd2', null, 'Jagan')], sessions: [], settlements: [], expenses: [lend('d', 'e2', 'd1', 'd2', 5818400)] };
  const data: AppData = { me, groups: [club, inr], contacts: [] };

  it('never adds rupees and dollars together for a friend', () => {
    const [f] = friendBalances(data);
    expect({ net: f!.net, currency: f!.currency }).toEqual({ net: 5818400, currency: 'INR' });
    expect(f!.others).toEqual([{ currency: 'USD', cents: 2000 }]);
  });
  it('keeps your own-currency totals separate from other currencies', () => {
    const t = totals(data);
    expect({ owed: t.owed, owe: t.owe, net: t.net }).toEqual({ owed: 2000, owe: 0, net: 2000 });
    expect(t.others).toEqual([{ currency: 'INR', cents: 5818400 }]);
  });
});
