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
