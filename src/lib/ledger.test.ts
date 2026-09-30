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
    members: ['a', 'b', 'c'].map((id) => ({ id, group_id: 'g', user_id: null, name: id, email: null, role: 'member' })),
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
