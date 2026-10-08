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
