import { describe, expect, it } from 'vitest';
import { friendsList, hasActivity, isSettledFriend, sharedSummary } from './ledger';
import { data, expense, group, meMember, member, payment } from '../test/fixtures';

const ravi = (id = 'm-ravi') => member(id, { name: 'Ravi', email: 'ravi@example.com' });
const raviRow = (d: ReturnType<typeof data>) => friendsList(d).find((f) => f.name === 'Ravi')!;

describe('what you share with a friend', () => {
  it('[FRIEND-4] counts real groups only: "1 shared group", "2 shared groups"', () => {
    const club = group({ id: 'c', kind: 'club', members: [meMember('a'), ravi('r1')] });
    const trip = group({ id: 't', members: [meMember('b'), ravi('r2')] });
    const oneOnOne = group({ id: 'd', is_direct: true, members: [meMember('c'), ravi('r3')], expenses: [expense('x', 'c', 1000, { c: 500, r3: 500 })] });
    expect(sharedSummary(raviRow(data([club, oneOnOne])))).toBe('1 shared group');
    expect(sharedSummary(raviRow(data([club, trip, oneOnOne])))).toBe('2 shared groups');
  });

  it('[FRIEND-4] says "one-on-one" when only a one-on-one has something in it', () => {
    const settled = group({ id: 'd', is_direct: true, members: [meMember('a'), ravi()],
      expenses: [expense('x', 'a', 1000, { a: 500, 'm-ravi': 500 })], settlements: [payment('p', 'm-ravi', 'a', 500)] });
    expect(sharedSummary(raviRow(data([settled])))).toBe('one-on-one');
  });

  it('[FRIEND-4] [FRIEND-5] says "nothing shared yet" for an empty or deleted-only one-on-one', () => {
    const empty = group({ id: 'd', is_direct: true, members: [meMember('a'), ravi()] });
    const deletedOnly = group({ id: 'd', is_direct: true, members: [meMember('a'), ravi()],
      deleted_expenses: [expense('x', 'a', 1000, { a: 500, 'm-ravi': 500 }, { deleted_at: '2026-02-01' })] });
    expect(sharedSummary(raviRow(data([empty])))).toBe('nothing shared yet');
    expect(sharedSummary(raviRow(data([deletedOnly])))).toBe('nothing shared yet');
  });

  it('[FRIEND-5] a group has activity only with a live expense, game, or payment', () => {
    expect(hasActivity(group())).toBe(false);
    expect(hasActivity(group({ deleted_expenses: [expense('x', 'a', 100, { a: 100 })] }))).toBe(false);
    expect(hasActivity(group({ expenses: [expense('x', 'a', 100, { a: 100 })] }))).toBe(true);
    expect(hasActivity(group({ settlements: [payment('p', 'a', 'b', 100)] }))).toBe(true);
  });
});

describe('removing a friend', () => {
  it('[FRIEND-6] is allowed only when settled in every currency', () => {
    expect(isSettledFriend({ net: 0, others: [] })).toBe(true);
    expect(isSettledFriend({ net: 0, others: [{ currency: 'INR', cents: 0 }] })).toBe(true);
    expect(isSettledFriend({ net: 500, others: [] })).toBe(false);
    expect(isSettledFriend({ net: 0, others: [{ currency: 'INR', cents: -100 }] })).toBe(false);
  });
});

describe('one-on-one balance rows on a friend page', () => {
  const pair = (id: string, currency: string, rCents: number) => group({
    id, is_direct: true, currency, members: [meMember(`me-${id}`), ravi(`r-${id}`)],
    // Positive rCents: Ravi owes you; negative: you owe Ravi.
    expenses: [rCents > 0
      ? expense(`x-${id}`, `me-${id}`, rCents, { [`r-${id}`]: rCents })
      : expense(`x-${id}`, `r-${id}`, -rCents, { [`me-${id}`]: -rCents })],
  });

  it('[FRIEND-8] adds up every one-on-one in a currency into one Balance row', async () => {
    const { directBalanceRows } = await import('./ledger');
    const rows = directBalanceRows(raviRow(data([pair('mine', 'USD', 5000), pair('theirs', 'USD', -1000)])), 'me-user');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: null, currency: 'USD', cents: 4000 });
    // Settle goes to the one-on-one that owes most in that direction.
    expect(rows[0]!.settleIn.group.id).toBe('mine');
  });

  it('[FRIEND-8] keeps one row per currency, labelled, and a row of its own for a one-on-one with a third person', async () => {
    const { directBalanceRows } = await import('./ledger');
    const three = group({ id: 'three', is_direct: true, members: [meMember('me3'), ravi('r3'), member('k3', { name: 'Kiran' })],
      expenses: [expense('t', 'me3', 900, { r3: 300, k3: 300, me3: 300 })] });
    const rows = directBalanceRows(raviRow(data([pair('usd', 'USD', 1000), pair('inr', 'INR', -2000), three])), 'me-user');
    expect(rows.map((r) => [r.label, r.currency, r.cents])).toEqual([['USD', 'USD', 1000], ['INR', 'INR', -2000], ['With Ravi, Kiran', 'USD', 300]]);
  });

  it('[FRIEND-8] leaves out empty one-on-ones', async () => {
    const { directBalanceRows } = await import('./ledger');
    const empty = group({ id: 'empty', is_direct: true, members: [meMember('me-e'), ravi('r-e')] });
    expect(directBalanceRows(raviRow(data([pair('a', 'USD', 1000), empty])), 'me-user')).toHaveLength(1);
  });
});
