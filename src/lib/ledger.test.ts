import { describe, expect, it } from 'vitest';
import { settle } from './settle';
import { splitByWeights, splitEqual, parseMoney } from './money';
import { groupBalances, simplify } from './ledger';
import type { Group } from './types';

describe('settle', () => {
  it('settles the sample game day in 4 payments', () => {
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
});

describe('groupBalances', () => {
  const g: Group = {
    id: 'g', name: 'Test', kind: 'mixed', currency: 'USD', created_by: null, created_at: '',
    members: ['a', 'b', 'c'].map((id) => ({ id, group_id: 'g', user_id: null, contact_id: null, name: id, email: null, role: 'member', email_opt_out: false })),
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

describe('summaryMailto', async () => {
  const { summaryMailto } = await import('./ledger');
  const g: Group = {
    id: 'g', name: 'Roommates', kind: 'expenses', currency: 'USD', created_by: null, created_at: '',
    members: [
      { id: 'a', group_id: 'g', user_id: null, contact_id: null, name: 'Ana', email: 'ana@x.com', role: 'owner', email_opt_out: false },
      { id: 'b', group_id: 'g', user_id: null, contact_id: null, name: 'Bo', email: 'bo@x.com', role: 'member', email_opt_out: true },
      { id: 'c', group_id: 'g', user_id: null, contact_id: null, name: 'Cy', email: null, role: 'member', email_opt_out: false },
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
});
