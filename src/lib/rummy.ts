import type { RummyGame, RummyPlayer } from './types';
import { settle, type Transfer } from './settle';
import { splitEqual } from './money';

export interface RummyStanding { player: RummyPlayer; total: number; eliminated: boolean }

/** Running total and elimination status per player, sorted lowest (safest) total first.
 *  A player's total is their round points plus any rejoin offset. */
export function rummyStandings(g: RummyGame): RummyStanding[] {
  const totals = new Map<string, number>();
  for (const r of g.rounds) for (const s of r.scores) totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.points);
  return g.players
    .map((player) => {
      const total = (totals.get(player.id) ?? 0) + (player.score_offset ?? 0);
      return { player, total, eliminated: total >= g.point_limit };
    })
    .sort((a, b) => a.total - b.total);
}

export function rummyActivePlayers(g: RummyGame): RummyPlayer[] {
  return rummyStandings(g).filter((s) => !s.eliminated).map((s) => s.player);
}

export function rummyWinner(g: RummyGame): RummyPlayer | null {
  if (!g.winner_player_id) return null;
  return g.players.find((p) => p.id === g.winner_player_id) ?? null;
}

/** What one player put in: their buy-in, plus one more for every rejoin. */
export function rummyPaid(g: RummyGame, p: RummyPlayer): number {
  return g.buy_in_cents * (1 + (p.rejoins ?? 0));
}

export function rummyPot(g: RummyGame): number {
  return g.players.reduce((a, p) => a + rummyPaid(g, p), 0);
}

/** Who can rejoin right now: knocked out, game still on, and at least two players still in. */
export function rummyCanRejoin(g: RummyGame, standings = rummyStandings(g)): boolean {
  return g.status === 'active' && standings.filter((s) => !s.eliminated).length >= 2;
}

export interface RummyResult {
  pot: number;
  /** Who shares the pot: the winner, or everyone still in when the game was closed early. */
  takers: RummyPlayer[];
  /** Per player: paid in, won back, and the difference. */
  rows: { player: RummyPlayer; paid: number; won: number; net: number }[];
  /** The fewest payments that square everyone, by player id. */
  transfers: Transfer[];
}

/** The money side of a finished game with a buy-in; null if there's no buy-in or it isn't over. */
export function rummyResult(g: RummyGame): RummyResult | null {
  if (g.status !== 'finished' || g.buy_in_cents <= 0) return null;
  const pot = rummyPot(g);
  const winner = rummyWinner(g);
  const takers = winner ? [winner] : rummyActivePlayers(g);
  if (takers.length === 0) return null;
  const shares = new Map(splitEqual(pot, takers.map((p) => p.id)).map((s) => [s.member_id, s.amount_cents]));
  const rows = g.players.map((player) => {
    const paid = rummyPaid(g, player);
    const won = shares.get(player.id) ?? 0;
    return { player, paid, won, net: won - paid };
  });
  return { pot, takers, rows, transfers: settle(rows.map((r) => ({ id: r.player.id, cents: r.net }))) };
}
