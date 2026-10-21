// Permission and lifecycle rules, run against demo mode. Demo mode enforces the same rules as the
// database (SPEC PLAT-4), so these tests pin both: if one changes, the other must follow.
import { beforeEach, describe, expect, it } from 'vitest';
import { groupBalances, isGroupAdmin } from '../lib/ledger';
import type { AppData, Group } from '../lib/types';

// Demo mode keeps its data in localStorage; Node has none, so give it a plain in-memory one.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const { demoApi: api, resetDemo } = await import('./demoApi');
const KEY = 'chipsplit_demo_v1';

/** Change the stored demo data directly: to stand in for another person's actions. */
function tamper(fn: (d: AppData) => void) {
  const d = JSON.parse(store.get(KEY)!) as AppData;
  fn(d);
  store.set(KEY, JSON.stringify(d));
}
const load = () => api.loadAll();
const byId = async (id: string) => (await load()).groups.find((g) => g.id === id)!;
const mine = (g: Group, meId: string) => g.members.find((m) => m.user_id === meId)!;

/** A fresh expenses group with you (admin) and Ravi (member). */
async function newGroup(kind: 'expenses' | 'club' | 'rummy' = 'expenses') {
  const id = await api.createGroup({ name: 'Test', kind, currency: 'USD' });
  const raviId = await api.addMember(id, 'Ravi', 'ravi@example.com');
  const d = await load();
  return { id, raviId, meId: d.me.id, me: mine(await byId(id), d.me.id).id };
}

/** Make you a plain member of a group, with Ravi as its admin. */
function demoteMe(groupId: string, meId: string, raviId: string) {
  tamper((d) => {
    const g = d.groups.find((x) => x.id === groupId)!;
    g.members.forEach((m) => { m.is_admin = m.id === raviId; if (m.user_id === meId) m.is_admin = false; });
  });
}

beforeEach(() => { store.clear(); resetDemo(); });

describe('[PLAT-4] roles', () => {
  it('[ROLE-1] the creator is the only admin; people added later are members', async () => {
    const { id, raviId, meId } = await newGroup();
    const g = await byId(id);
    expect(isGroupAdmin(g, meId)).toBe(true);
    expect(g.members.find((m) => m.id === raviId)!.is_admin).toBe(false);
  });

  it('[ROLE-2] an admin can promote others, but the last admin cannot step down', async () => {
    const { id, raviId, me } = await newGroup();
    await expect(api.setGroupAdmin(me, false)).rejects.toThrow(/at least one admin/);
    await api.setGroupAdmin(raviId, true);
    expect((await byId(id)).members.find((m) => m.id === raviId)!.is_admin).toBe(true);
    await api.setGroupAdmin(me, false);
    expect(mine(await byId(id), (await load()).me.id).is_admin).toBe(false);
  });

  it('[ROLE-3] only admins change settings or delete the group', async () => {
    const { id, raviId, meId } = await newGroup();
    demoteMe(id, meId, raviId);
    await expect(api.updateGroup(id, { name: 'Renamed' })).rejects.toThrow(/admin/);
    await expect(api.deleteGroup(id)).rejects.toThrow(/admin/);
    expect((await byId(id)).name).toBe('Test');
  });

  it('[ROLE-4] a group cannot be deleted until everyone is settled up', async () => {
    const { id, raviId, me } = await newGroup();
    await api.saveExpense({ group_id: id, description: 'Dinner', category: 'food', amount_cents: 2000, spent_on: '2026-01-01',
      payers: [{ member_id: me, amount_cents: 2000 }], shares: [{ member_id: me, amount_cents: 1000 }, { member_id: raviId, amount_cents: 1000 }] });
    await expect(api.deleteGroup(id)).rejects.toThrow(/settle/i);
    await api.addSettlement({ group_id: id, from_member: raviId, to_member: me, amount_cents: 1000, method: null, note: null, session_id: null, settled_on: '2026-01-02' });
    await api.deleteGroup(id);
    expect((await load()).groups.some((g) => g.id === id)).toBe(false);
  });

  it('[ROLE-5] someone with history in a group cannot be removed; someone without can', async () => {
    const { id, raviId, me } = await newGroup();
    const kiranId = await api.addMember(id, 'Kiran', null);
    await api.saveExpense({ group_id: id, description: 'Cab', category: 'travel', amount_cents: 1000, spent_on: '2026-01-01',
      payers: [{ member_id: me, amount_cents: 1000 }], shares: [{ member_id: raviId, amount_cents: 1000 }] });
    await expect(api.removeMember(raviId)).rejects.toThrow(/can't be removed/);
    await api.removeMember(kiranId);
    expect((await byId(id)).members.map((m) => m.id)).not.toContain(kiranId);
  });
});

describe('[PLAT-4] expenses', () => {
  it('[EXP-1] any member can add, edit, delete, and restore an expense', async () => {
    const { id, raviId, meId, me } = await newGroup();
    demoteMe(id, meId, raviId);
    await api.saveExpense({ group_id: id, description: 'Lunch', category: 'food', amount_cents: 1000, spent_on: '2026-01-01',
      payers: [{ member_id: me, amount_cents: 1000 }], shares: [{ member_id: raviId, amount_cents: 1000 }] });
    const e = (await byId(id)).expenses[0]!;
    await api.saveExpense({ ...e, description: 'Brunch' }, e.id);
    await api.deleteExpense(e.id);
    await api.restoreExpense(e.id);
    expect((await byId(id)).expenses.map((x) => x.description)).toEqual(['Brunch']);
  });

  it('[EXP-2] deleting hides an expense from balances; restoring brings it back unchanged', async () => {
    const { id, raviId, me } = await newGroup();
    await api.saveExpense({ group_id: id, description: 'Hotel', category: 'stay', amount_cents: 6000, spent_on: '2026-01-01',
      payers: [{ member_id: me, amount_cents: 6000 }], shares: [{ member_id: me, amount_cents: 3000 }, { member_id: raviId, amount_cents: 3000 }] });
    const before = (await byId(id)).expenses[0]!;
    await api.deleteExpense(before.id);
    let g = await byId(id);
    expect(g.expenses).toEqual([]);
    expect(g.deleted_expenses!.map((x) => x.id)).toEqual([before.id]);
    expect(groupBalances(g).get(raviId) ?? 0).toBe(0);
    await api.restoreExpense(before.id);
    g = await byId(id);
    expect(g.expenses[0]).toEqual({ ...before, deleted_at: null });
    expect(groupBalances(g).get(raviId)).toBe(-3000);
  });
});

describe('[PLAT-4] games', () => {
  /** A finished club game: you won $20 off Ravi. */
  async function finishedGame() {
    const { id, raviId, meId, me } = await newGroup('club');
    const sid = await api.createSession({ group_id: id, played_on: '2026-01-01', location: null, notes: null, default_buy_in_cents: 2000 });
    await api.saveSessionResults(sid, [
      { member_id: me, buy_in_cents: 2000, cash_out_cents: 4000 },
      { member_id: raviId, buy_in_cents: 2000, cash_out_cents: 0 },
    ]);
    await api.updateSession(sid, { status: 'final' });
    return { id, sid, raviId, meId, me };
  }

  it('[GAME-2] any member can start a game, and becomes its host', async () => {
    const { id, raviId, meId } = await newGroup('club');
    demoteMe(id, meId, raviId);
    const sid = await api.createSession({ group_id: id, played_on: '2026-01-01', location: null, notes: null, default_buy_in_cents: 1000 });
    expect((await byId(id)).sessions.find((s) => s.id === sid)!.created_by).toBe(meId);
  });

  it('[GAME-3] only the host changes a game or its payments', async () => {
    const { id, sid, raviId, me } = await finishedGame();
    tamper((d) => { d.groups.find((g) => g.id === id)!.sessions[0]!.created_by = 'someone-else'; });
    await expect(api.updateSession(sid, { location: 'Here' })).rejects.toThrow(/started this game/);
    await expect(api.saveSessionResults(sid, [])).rejects.toThrow(/started this game/);
    await expect(api.addSettlement({ group_id: id, from_member: raviId, to_member: me, amount_cents: 2000, method: null, note: null, session_id: sid, settled_on: '2026-01-02' }))
      .rejects.toThrow(/started this game/);
    await expect(api.deleteSession(sid)).rejects.toThrow(/started this game/);
  });

  it('[GAME-4] a finished game cannot be deleted until its own payments settle it', async () => {
    const { sid } = await finishedGame();
    await expect(api.deleteSession(sid)).rejects.toThrow(/settle/i);
  });

  it('[GAME-4] a game in progress can be deleted any time', async () => {
    const { id } = await newGroup('club');
    const sid = await api.createSession({ group_id: id, played_on: '2026-01-01', location: null, notes: null, default_buy_in_cents: 1000 });
    await api.deleteSession(sid);
    expect((await byId(id)).sessions).toEqual([]);
  });

  it('[GAME-5] deleting hides the game and its payments, balances unchanged; the host restores it exactly', async () => {
    const { id, sid, raviId, me } = await finishedGame();
    await api.addSettlement({ group_id: id, from_member: raviId, to_member: me, amount_cents: 2000, method: 'Cash', note: null, session_id: sid, settled_on: '2026-01-02' });
    const before = await byId(id);
    const balancesBefore = [...groupBalances(before)];

    await api.deleteSession(sid);
    const hidden = await byId(id);
    expect(hidden.sessions).toEqual([]);
    expect(hidden.settlements).toEqual([]);
    expect(hidden.deleted_sessions!.map((s) => [s.id, s.payments!.length])).toEqual([[sid, 1]]);
    expect([...groupBalances(hidden)].every(([, c]) => c === 0)).toBe(true);

    await api.restoreSession(sid);
    const back = await byId(id);
    expect(back.sessions.map((s) => ({ ...s, deleted_at: undefined }))).toEqual(before.sessions.map((s) => ({ ...s, deleted_at: undefined })));
    expect(back.settlements).toEqual(before.settlements);
    expect([...groupBalances(back)]).toEqual(balancesBefore);
  });
});

describe('[PLAT-4] group types', () => {
  it('[GROUP-1] a group keeps the type it was created with', async () => {
    const { id } = await newGroup('club');
    await expect(api.updateGroup(id, { kind: 'expenses' })).rejects.toThrow(/type/);
    await api.updateGroup(id, { name: 'Poker Pals' });
    expect(await byId(id)).toMatchObject({ kind: 'club', name: 'Poker Pals' });
  });

  it('[RUMMY-7] rummy games start only in a Rummy group, never stand-alone', async () => {
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    const poker = await newGroup('club');
    await expect(api.createRummyGame({ groupId: poker.id, name: '', pointLimit: 101, buyInCents: 1000, players })).rejects.toThrow(/Rummy group/);
    await expect(api.createRummyGame({ groupId: null, name: '', pointLimit: 101, buyInCents: 1000, players })).rejects.toThrow(/Rummy group/);
    const rummy = await newGroup('rummy');
    const gameId = await api.createRummyGame({ groupId: rummy.id, name: '', pointLimit: 101, buyInCents: 1000, players });
    expect((await api.loadRummyGames(rummy.id)).map((g) => g.id)).toEqual([gameId]);
  });
});

describe('[PLAT-4] rummy history', () => {
  it('[RUMMY-13] starting a rummy game, adding and fixing a round, and closing it show in History', async () => {
    const { id } = await newGroup('rummy');
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    const gameId = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    const g = (await api.loadRummyGame(gameId))!;
    await api.addRummyRound(gameId, g.players.map((p, i) => ({ playerId: p.id, points: i * 20 })));
    const round = (await api.loadRummyGame(gameId))!.rounds[0]!;
    await api.updateRummyRound(round.id, g.players.map((p, i) => ({ playerId: p.id, points: i * 30 })));
    await api.closeRummyGame(gameId);
    const history = (await api.loadHistory(id)).map((e) => e.summary);
    expect(history).toEqual(expect.arrayContaining([
      'Started rummy game "Game 1"', 'Added round 1 in "Game 1"', 'Changed round 1 in "Game 1"', 'Closed rummy game "Game 1"',
    ]));
  });
});

describe('[PLAT-4] rummy payouts', () => {
  it('[RUMMY-10] a finished staked game goes into balances once, with one line in History', async () => {
    const { id, raviId, me } = await newGroup('rummy');
    const g0 = await byId(id);
    const players = g0.members.map((m) => ({ name: m.name, userId: m.user_id }));
    const gameId = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    const ps = (await api.loadRummyGame(gameId))!.players;
    await api.addRummyRound(gameId, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 110 })));
    const rows = [{ member_id: me, buy_in_cents: 1000, cash_out_cents: 2000 }, { member_id: raviId, buy_in_cents: 1000, cash_out_cents: 0 }];
    await api.postRummyPayout(gameId, rows);
    await expect(api.postRummyPayout(gameId, rows)).rejects.toThrow(/already/);
    const g = await byId(id);
    expect(groupBalances(g).get(raviId)).toBe(-1000);
    expect((await api.loadHistory(id)).filter((e) => e.summary.includes('payout'))).toHaveLength(1);
  });
});

describe('[PLAT-4] one game at a time', () => {
  const session = (group_id: string) => ({ group_id, played_on: '2026-01-01', location: 'Teja\'s place', notes: null, default_buy_in_cents: 1000 });

  it('[GAME-11] a Poker group refuses a second game while one is in progress, and says which', async () => {
    const { id } = await newGroup('club');
    const first = await api.createSession(session(id));
    await expect(api.createSession(session(id))).rejects.toThrow(/in progress.*Teja's place/);
    await api.deleteSession(first);
    const second = await api.createSession(session(id));
    // Restoring the deleted one would make two in progress.
    await expect(api.restoreSession(first)).rejects.toThrow(/in progress/);
    await api.updateSession(second, { status: 'final' });
    await api.restoreSession(first);
    // Reopening a finished game while another is in progress is refused too.
    await expect(api.updateSession(second, { status: 'open' })).rejects.toThrow(/in progress/);
  });

  it('[RUMMY-15] a Rummy group refuses a second rummy game while one is in progress', async () => {
    const { id } = await newGroup('rummy');
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    const first = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    await expect(api.createRummyGame({ groupId: id, name: 'Game 2', pointLimit: 101, buyInCents: 1000, players })).rejects.toThrow(/"Game 1" is still in progress/);
    const ps = (await api.loadRummyGame(first))!.players;
    await api.addRummyRound(first, ps.map((p, i) => ({ playerId: p.id, points: i ? 120 : 0 })));
    const second = await api.createRummyGame({ groupId: id, name: 'Game 2', pointLimit: 101, buyInCents: 1000, players });
    // Lowering the finishing score would put Game 1 back in play next to Game 2.
    const round = (await api.loadRummyGame(first))!.rounds[0]!;
    await expect(api.updateRummyRound(round.id, ps.map((p, i) => ({ playerId: p.id, points: i ? 20 : 0 })))).rejects.toThrow(/"Game 2" is still in progress/);
    expect((await api.loadRummyGame(second))!.status).toBe('active');
  });

  it('[RUMMY-6] only the scorer changes or deletes a rummy game', async () => {
    const { id } = await newGroup('rummy');
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    const gameId = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    const ps = (await api.loadRummyGame(gameId))!.players;
    await api.addRummyRound(gameId, ps.map((p, i) => ({ playerId: p.id, points: i * 10 })));
    const round = (await api.loadRummyGame(gameId))!.rounds[0]!;
    tamper((d) => { (d as unknown as { rummyGames: { id: string; scorer_id: string }[] }).rummyGames.find((g) => g.id === gameId)!.scorer_id = 'someone-else'; });
    const scores = ps.map((p) => ({ playerId: p.id, points: 5 }));
    await expect(api.addRummyRound(gameId, scores)).rejects.toThrow(/scorer/);
    await expect(api.updateRummyRound(round.id, scores)).rejects.toThrow(/scorer/);
    await expect(api.closeRummyGame(gameId)).rejects.toThrow(/scorer/);
    await expect(api.deleteRummyGame(gameId)).rejects.toThrow(/scorer/);
  });
});

describe('[PLAT-4] rummy table size and rejoining', () => {
  it('[RUMMY-16] a rummy game takes 2 to 7 players', async () => {
    const { id } = await newGroup('rummy');
    const seat = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, userId: null }));
    await expect(api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 1000, players: seat(8) })).rejects.toThrow(/7 players/);
    await expect(api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 1000, players: seat(1) })).rejects.toThrow(/two players/);
    await api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 1000, players: seat(7) });
  });

  it('[RUMMY-2] the scorer brings a player back at the start they confirm, within the limit', async () => {
    const { id } = await newGroup('rummy');
    const players = ['A', 'B', 'C'].map((name) => ({ name, userId: null }));
    const gameId = await api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 1000, players });
    const [a, b, c] = (await api.loadRummyGame(gameId))!.players;
    await api.addRummyRound(gameId, [{ playerId: a!.id, points: 110 }, { playerId: b!.id, points: 50 }, { playerId: c!.id, points: 0 }]);
    await expect(api.rejoinRummyPlayer(a!.id, 101)).rejects.toThrow(/below 101/);
    await api.rejoinRummyPlayer(a!.id, 51);
    const { rummyStandings } = await import('../lib/rummy');
    const back = rummyStandings((await api.loadRummyGame(gameId))!).find((s) => s.player.id === a!.id)!;
    expect([back.total, back.eliminated, back.player.rejoins]).toEqual([51, false, 1]);
  });
});

describe('[PLAT-4] deleting a rummy game', () => {
  it('[RUMMY-17] a finished staked game is deleted only once settled, and takes its payout with it', async () => {
    const { id, raviId, me } = await newGroup('rummy');
    const g0 = await byId(id);
    const players = g0.members.map((m) => ({ name: m.name, userId: m.user_id }));
    const gameId = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    const ps = (await api.loadRummyGame(gameId))!.players;
    await api.addRummyRound(gameId, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 110 })));
    const sid = await api.postRummyPayout(gameId, [{ member_id: me, buy_in_cents: 1000, cash_out_cents: 2000 }, { member_id: raviId, buy_in_cents: 1000, cash_out_cents: 0 }]);
    await expect(api.deleteRummyGame(gameId)).rejects.toThrow(/Settle up/);
    await api.addSettlement({ group_id: id, from_member: raviId, to_member: me, amount_cents: 1000, method: 'Cash', note: null, session_id: sid, settled_on: '2026-01-02' });
    await api.deleteRummyGame(gameId);
    const g = await byId(id);
    expect(g.sessions).toEqual([]);
    expect(g.settlements).toEqual([]);
    expect([...groupBalances(g).values()].every((c) => c === 0)).toBe(true);
  });

  it('[RUMMY-17] a game in progress, or without a buy-in, can be deleted any time', async () => {
    const { id } = await newGroup('rummy');
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    const live = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    await api.deleteRummyGame(live);
    expect(await api.loadRummyGames(id)).toEqual([]);
  });
});

describe('[PLAT-4] rummy payout follows the result', () => {
  async function postedGame() {
    const { id, raviId, me } = await newGroup('rummy');
    const players = (await byId(id)).members.map((m) => ({ name: m.name, userId: m.user_id }));
    const gameId = await api.createRummyGame({ groupId: id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players });
    const ps = (await api.loadRummyGame(gameId))!.players;
    await api.addRummyRound(gameId, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 110 })));
    const sid = await api.postRummyPayout(gameId, [{ member_id: me, buy_in_cents: 1000, cash_out_cents: 2000 }, { member_id: raviId, buy_in_cents: 1000, cash_out_cents: 0 }]);
    const round = (await api.loadRummyGame(gameId))!.rounds[0]!;
    return { id, raviId, me, gameId, ps, sid, round };
  }

  it('[RUMMY-18] editing a finished game back into play takes its payout out of the balances', async () => {
    const { id, gameId, ps, round } = await postedGame();
    await api.updateRummyRound(round.id, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 50 })));
    const game = (await api.loadRummyGame(gameId))!;
    expect([game.status, game.session_id]).toEqual(['active', null]);
    const g = await byId(id);
    expect(g.sessions).toEqual([]);
    expect([...groupBalances(g).values()].every((c) => c === 0)).toBe(true);
  });

  it('[RUMMY-18] is refused while payments are marked against the payout', async () => {
    const { id, raviId, me, ps, sid, round } = await postedGame();
    await api.addSettlement({ group_id: id, from_member: raviId, to_member: me, amount_cents: 1000, method: 'Cash', note: null, session_id: sid, settled_on: '2026-01-02' });
    await expect(api.updateRummyRound(round.id, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 50 })))).rejects.toThrow(/Undo the payments/);
  });

  it('[RUMMY-18] an edit that keeps the same result leaves the payout alone', async () => {
    const { gameId, ps, sid, round } = await postedGame();
    await api.updateRummyRound(round.id, ps.map((p, i) => ({ playerId: p.id, points: i === 0 ? 0 : 130 })));
    expect((await api.loadRummyGame(gameId))!.session_id).toBe(sid);
  });
});

describe('[PLAT-4] rummy buy-in', () => {
  it('[RUMMY-19] a new rummy game needs a buy-in above zero', async () => {
    const { id } = await newGroup('rummy');
    const players = [{ name: 'Me', userId: null }, { name: 'Ravi', userId: null }];
    await expect(api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 0, players })).rejects.toThrow(/buy-in/);
    await api.createRummyGame({ groupId: id, name: '', pointLimit: 101, buyInCents: 500, players });
  });
});

describe('[PLAT-4] friends', () => {
  it('[FRIEND-11] adding someone to a group does not add them to your friends', async () => {
    const before = (await load()).contacts.length;
    const id = await api.createGroup({ name: 'Trip', kind: 'expenses', currency: 'USD' });
    await api.addMember(id, 'Zoya', 'zoya@example.com');
    await api.addMember(id, 'Guest Guy', null);
    expect((await load()).contacts).toHaveLength(before);
  });
});
