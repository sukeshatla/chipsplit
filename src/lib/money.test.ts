import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney, splitByWeights, splitEqual } from './money';

const sum = (xs: { amount_cents: number }[]) => xs.reduce((a, x) => a + x.amount_cents, 0);

describe('money', () => {
  it('[MONEY-1] every split part is a whole number of cents that adds back to the total', () => {
    for (const total of [1, 99, 1000, 1001, 33333]) {
      for (const n of [1, 2, 3, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `p${i}`);
        for (const parts of [splitEqual(total, ids), splitByWeights(total, ids.map((id, i) => ({ id, weight: i + 1 })))]) {
          expect(parts.every((p) => Number.isInteger(p.amount_cents))).toBe(true);
          expect(sum(parts)).toBe(total);
        }
      }
    }
  });

  it('[MONEY-3] splits by shares: 2 shares pay twice as much as 1', () => {
    expect(splitByWeights(1000, [{ id: 'a', weight: 2 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }]))
      .toEqual([{ member_id: 'a', amount_cents: 500 }, { member_id: 'b', amount_cents: 250 }, { member_id: 'c', amount_cents: 250 }]);
  });

  it('[MONEY-3] gives leftover cents to the largest remainders, and nothing to zero weights', () => {
    const parts = splitByWeights(1001, [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }, { id: 'z', weight: 0 }]);
    expect(parts.map((p) => p.member_id)).toEqual(['a', 'b', 'c']);
    expect(sum(parts)).toBe(1001);
    expect(splitByWeights(500, [{ id: 'a', weight: 0 }])).toEqual([]);
  });

  it('[MONEY-5] empty or invalid input is null, not zero', () => {
    for (const bad of ['', '-', '.', 'abc', null, undefined]) expect(parseMoney(bad)).toBeNull();
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('₹2,500')).toBe(250000);
  });

  it('[MONEY-6] negatives use a true minus sign; + only when asked', () => {
    expect(formatMoney(-1250, 'USD')).toMatch(/^−\$12\.50$/);
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
    expect(formatMoney(1250, 'USD', { sign: true })).toBe('+$12.50');
    expect(formatMoney(0, 'USD', { sign: true })).toBe('$0');
    expect(formatMoney(2000, 'USD')).toBe('$20');
  });
});
