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
async function newGroup(kind: 'expenses' | 'club' = 'expenses') {
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
