import type { RummyGame, RummyPlayer } from './types';

export interface RummyStanding { player: RummyPlayer; total: number; eliminated: boolean }

/** Running total and elimination status per player, sorted lowest (safest) total first. */
export function rummyStandings(g: RummyGame): RummyStanding[] {
  const totals = new Map<string, number>();
  for (const r of g.rounds) for (const s of r.scores) totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.points);
  return g.players
    .map((player) => {
      const total = totals.get(player.id) ?? 0;
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
