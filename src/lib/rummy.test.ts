import { describe, expect, it } from 'vitest';
import { rummyCanRejoin, rummyPot, rummyResult, rummyStandings } from './rummy';
import type { RummyGame } from './types';

function game(over: Partial<RummyGame> = {}, scores: number[][] = []): RummyGame {
  const players = ['a', 'b', 'c'].map((id) => ({ id, rummy_game_id: 'g', user_id: null, name: id.toUpperCase(), rejoins: 0, score_offset: 0 }));
  return {
    id: 'g', group_id: null, name: null, point_limit: 101, buy_in_cents: 1000, session_id: null, status: 'active',
    scorer_id: 'me', winner_player_id: null, created_at: '', finished_at: null, players,
    rounds: scores.map((row, i) => ({ id: `r${i}`, round_no: i + 1, created_at: '', scores: row.map((points, j) => ({ player_id: players[j]!.id, points })) })),
    ...over,
  };
}

describe('rummy', () => {
  it('[RUMMY-1] adds the rejoin offset to a player\'s total', () => {
    const g = game({}, [[60, 20, 10], [50, 30, 0]]); // a: 110 (out), b: 50, c: 10
    g.players[0]!.score_offset = 50 - 110; // rejoined at the top active total (b's 50)
    g.players[0]!.rejoins = 1;
    const a = rummyStandings(g).find((s) => s.player.id === 'a')!;
    expect(a.total).toBe(50);
    expect(a.eliminated).toBe(false);
    expect(rummyPot(g)).toBe(4000); // 3 buy-ins + 1 rejoin
  });

  it('[RUMMY-2] only allows rejoining while two or more are still in', () => {
    expect(rummyCanRejoin(game({}, [[110, 20, 10]]))).toBe(true);
    expect(rummyCanRejoin(game({}, [[110, 120, 10]]))).toBe(false);
  });

  it('[RUMMY-3] pays the whole pot to the winner', () => {
    const g = game({ status: 'finished', winner_player_id: 'c' }, [[110, 120, 10]]);
    g.players[0]!.rejoins = 1;
    const r = rummyResult(g)!;
    expect(r.pot).toBe(4000);
    expect(r.rows.find((x) => x.player.id === 'c')!.net).toBe(3000);
    expect(r.transfers).toEqual([{ from: 'a', to: 'c', cents: 2000 }, { from: 'b', to: 'c', cents: 1000 }]);
  });

  it('[RUMMY-4] splits the pot between everyone still in when closed early', () => {
    const r = rummyResult(game({ status: 'finished' }, [[110, 20, 10]]))!;
    expect(r.takers.map((p) => p.id).sort()).toEqual(['b', 'c']);
    expect(r.rows.map((x) => x.won)).toEqual([0, 1500, 1500]);
    expect(r.rows.reduce((a, x) => a + x.net, 0)).toBe(0);
  });

  it('[RUMMY-5] has no money side without a buy-in or before the end', () => {
    expect(rummyResult(game({ status: 'finished', buy_in_cents: 0, winner_player_id: 'c' }))).toBeNull();
    expect(rummyResult(game())).toBeNull();
  });
});

describe('rummy in a Rummy group', async () => {
  const { rummyBalanceRows, rummyLeaderboard, rummyTableData } = await import('./ledger');
  const { imageBanner, imageParts } = await import('./summaryImage');
  const { group: makeGroup, member, game: session } = await import('../test/fixtures');
  // Members A, B, C line up with the rummy players a, b, c by name.
  const g = makeGroup({ id: 'rg', kind: 'rummy', name: 'Sunday rummy', members: ['A', 'B', 'C'].map((n) => member(`m${n}`, { name: n })) });
  // a wins (b and c out at 101), $10 buy-in each: a +$20, b and c -$10.
  const won = game({ id: 'g1', status: 'finished', winner_player_id: 'a' }, [[0, 60, 60], [0, 50, 50]]);

  it('[RUMMY-10] a finished staked game becomes one finished-game row per member: buy-in paid, pot won', () => {
    expect(rummyBalanceRows(won, g)).toEqual([
      { member_id: 'mA', buy_in_cents: 1000, cash_out_cents: 3000 },
      { member_id: 'mB', buy_in_cents: 1000, cash_out_cents: 0 },
      { member_id: 'mC', buy_in_cents: 1000, cash_out_cents: 0 },
    ]);
  });

  it('[RUMMY-10] nothing to add while in progress, without a buy-in, or when a player is not in the group', () => {
    expect(rummyBalanceRows(game({ id: 'g2' }), g)).toBeNull();
    expect(rummyBalanceRows({ ...won, buy_in_cents: 0 }, g)).toBeNull();
    const stranger = { ...won, players: won.players.map((p) => (p.id === 'c' ? { ...p, name: 'Zed' } : p)) };
    expect(rummyBalanceRows(stranger, g)).toBeNull();
  });

  it('[RUMMY-8] the leaderboard counts finished games and wins, and money from the payouts in balances', () => {
    const posted = session('s1', { mA: [1000, 3000], mB: [1000, 0], mC: [1000, 0] });
    const withPayout = { ...g, sessions: [posted] };
    const unstaked = game({ id: 'g3', status: 'finished', winner_player_id: 'b', buy_in_cents: 0 }, [[60, 0, 60], [50, 0, 50]]);
    const live = game({ id: 'g4' });
    const rows = rummyLeaderboard(withPayout, [won, unstaked, live]);
    expect(rows.map((r) => [r.name, r.games, r.wins, r.net])).toEqual([['A', 2, 1, 2000], ['B', 2, 1, -1000], ['C', 2, 0, -1000]]);
  });

  it('[RUMMY-9] a game in progress shares as "Rummy · In progress"; a finished one as "Rummy · Final"', () => {
    const live = rummyTableData(game({ id: 'g4' }, [[0, 30, 10]]), g);
    expect(imageParts(live)).toEqual(['table']);
    expect(imageBanner(live, 'table').label).toBe('Rummy · In progress');
    expect(live.rummy!.rows.map((r) => [r.name, r.total, r.out])).toEqual([['A', 0, false], ['C', 10, false], ['B', 30, false]]);
    const fin = rummyTableData(won, g);
    expect(imageBanner(fin, 'table').label).toBe('Rummy · Final');
    expect(imageBanner(fin, 'table').details).toContain('Out at 101');
    expect(fin.rummy!.rows.find((r) => r.name === 'B')!.out).toBe(true);
  });
});
