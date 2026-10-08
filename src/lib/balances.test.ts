import { describe, expect, it } from 'vitest';
import { friendsList, groupBalances, pokerLeaderboard } from './ledger';
import { data, expense, game, group, meMember, member, payment } from '../test/fixtures';

describe('balances', () => {
  it('[BAL-4] deleted expenses and deleted games count toward nothing', () => {
    const g = group({
      members: [member('a'), member('b')],
      expenses: [expense('live', 'a', 1000, { a: 500, b: 500 })],
      deleted_expenses: [expense('gone', 'a', 9000, { b: 9000 }, { deleted_at: '2026-02-01' })],
      deleted_sessions: [game('old', { a: [1000, 5000], b: [5000, 1000] }, { deleted_at: '2026-02-01', payments: [payment('gp', 'b', 'a', 4000, { session_id: 'old' })] })],
    });
    expect(groupBalances(g).get('a')).toBe(500);
    expect(groupBalances(g).get('b')).toBe(-500);
  });

  it('[BAL-7] friends: biggest amount first whether owed or owing, settled last, ties by name', () => {
    const m = meMember('me');
    const people = ['Ana', 'Bo', 'Cy', 'Di', 'Ed'].map((n) => member(n, { name: n }));
    const g = group({
      members: [m, ...people],
      expenses: [
        expense('1', 'me', 3000, { Ana: 3000 }), // Ana owes you 30
        expense('2', 'Bo', 8000, { me: 8000 }), // you owe Bo 80
        expense('3', 'me', 3000, { Cy: 3000 }), // Cy owes you 30 (ties with Ana)
        expense('4', 'me', 1000, { Di: 1000 }), // Di owes you 10
      ],
    });
    expect(friendsList(data([g])).map((f) => f.name)).toEqual(['Bo', 'Ana', 'Cy', 'Di', 'Ed']);
  });
});

describe('leaderboard', () => {
  it('[GAME-9] totals finished games only; payments and games in progress do not change it', () => {
    const g = group({
      kind: 'club',
      members: [member('a'), member('b')],
      sessions: [
        game('1', { a: [1000, 3000], b: [3000, 1000] }),
        game('2', { a: [2000, 1000], b: [1000, 2000] }),
        game('3', { a: [1000, 9000], b: [9000, 1000] }, { status: 'open' }),
      ],
      settlements: [payment('p', 'b', 'a', 1000)],
    });
    const [first, second] = pokerLeaderboard(g);
    expect(first).toMatchObject({ memberId: 'a', net: 1000, games: 2, wins: 1, best: 2000 });
    expect(second).toMatchObject({ memberId: 'b', net: -1000, games: 2, wins: 1, best: 1000 });
  });
});
