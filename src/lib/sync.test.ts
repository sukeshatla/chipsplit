import { describe, expect, it } from 'vitest';
import { needsFullReload, withSession } from './ledger';
import { data, game, group, member } from '../test/fixtures';

describe('live game refresh', () => {
  const live = game('s1', { a: [1000, 0], b: [1000, 0] }, { status: 'open' });
  const other = group({ id: 'g2', members: [member('x')] });
  const d = data([group({ members: [member('a'), member('b')], sessions: [live, game('s0', { a: [500, 500] })] }), other]);

  it('[PLAT-5] swaps in just the refreshed game and leaves everything else as it was', () => {
    const fresh = { ...live, results: [{ member_id: 'a', buy_in_cents: 2000, cash_out_cents: 0 }, { member_id: 'b', buy_in_cents: 1000, cash_out_cents: 0 }] };
    const next = withSession(d, fresh);
    expect(next.groups[0]!.sessions.find((s) => s.id === 's1')!.results[0]!.buy_in_cents).toBe(2000);
    expect(next.groups[0]!.sessions.map((s) => s.id)).toEqual(['s1', 's0']);
    expect(next.groups[1]).toBe(other);
    expect(d.groups[0]!.sessions[0]!.results[0]!.buy_in_cents).toBe(1000);
  });

  it('[PLAT-5] reloads everything once the game finishes, reopens, or is deleted', () => {
    expect(needsFullReload(live, { ...live, results: [] })).toBe(false);
    expect(needsFullReload(live, { ...live, status: 'final' })).toBe(true);
    expect(needsFullReload(live, { ...live, deleted_at: '2026-10-19T00:00:00Z' })).toBe(true);
    expect(needsFullReload(live, null)).toBe(true);
  });
});
