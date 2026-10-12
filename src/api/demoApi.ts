import type { AppData, ChangeLogEntry, Contact, Group, RummyGame, RummyPlayer } from '../lib/types';
import type { DataApi } from './types';
import { RUMMY_MAX_PLAYERS, rummyStandings } from '../lib/rummy';
import { isGroupSettled, isSessionSettled, memberHasActivity } from '../lib/ledger';
import { seedChangeLog, seedDemo, uid } from './seed';

const KEY = 'chipsplit_demo_v1';

/** The demo store keeps the activity log and rummy games alongside AppData; neither is part of the public shape. */
type DemoStore = AppData & { changeLog: ChangeLogEntry[]; rummyGames: RummyGame[] };

function freshDemo(): DemoStore {
  const data = seedDemo();
  return { ...data, changeLog: seedChangeLog(data), rummyGames: [] };
}

function load(): DemoStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as DemoStore;
      d.changeLog ??= [];
      d.rummyGames ??= [];
      d.groups.forEach((g) => { g.deleted_expenses ??= []; g.deleted_sessions ??= []; });
      d.rummyGames.forEach((g) => {
        g.buy_in_cents ??= 0; g.session_id ??= null;
        g.players.forEach((p) => { p.rejoins ??= 0; p.score_offset ??= 0; });
      });
      return d;
    }
  } catch { /* fall through to a fresh seed */ }
  const d = freshDemo();
  save(d);
  return d;
}

function save(d: DemoStore) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

export function resetDemo() {
  save(freshDemo());
}

const now = () => new Date().toISOString();

/** Apply a change to the stored demo data, with a short delay so loading states are visible. */
function mutate<T>(fn: (d: DemoStore) => T): Promise<T> {
  try {
    const d = load();
    const r = fn(d);
    save(d);
    // Tests skip the delay; it only exists so people see loading states.
    return new Promise((res) => setTimeout(() => res(r), import.meta.env.MODE === 'test' ? 0 : 120));
  } catch (e) {
    return Promise.reject(e);
  }
}

function group(d: AppData, id: string): Group {
  const g = d.groups.find((x) => x.id === id);
  if (!g) throw new Error('That group no longer exists');
  return g;
}

function groupOf(d: AppData, pick: (g: Group) => boolean): Group {
  const g = d.groups.find(pick);
  if (!g) throw new Error('That item no longer exists');
  return g;
}

/** Add or reuse (by email) an entry in the demo user's own friends list. */
function upsertContact(d: AppData, name: string, email: string | null): Contact {
  const em = email?.trim().toLowerCase() || null;
  if (em) {
    const existing = d.contacts.find((c) => c.email === em);
    if (existing) return existing; // re-adding by email links, never renames (0023)
  }
  const c: Contact = { id: uid(), owner_id: d.me.id, user_id: em && em === d.me.email ? d.me.id : null, name, email: em, created_at: now() };
  d.contacts.push(c);
  return c;
}

function log(d: DemoStore, groupId: string, entityType: ChangeLogEntry['entity_type'], entityId: string | null, summary: string) {
  d.changeLog.push({ id: uid(), group_id: groupId, actor_id: d.me.id, entity_type: entityType, entity_id: entityId, summary, created_at: now() });
}

/** Mirrors the server-side admin check, so demo mode shows the same gating as the real backend. */
function assertAdmin(d: DemoStore, g: Group, message: string) {
  if (!g.members.some((m) => m.user_id === d.me.id && m.is_admin)) throw new Error(message);
}

/** One game in progress per group (SPEC GAME-11, RUMMY-15), same wording as the server (0027). */
function assertNoOpenGame(g: Group, exceptId?: string) {
  const open = g.sessions.find((s) => s.status === 'open' && s.id !== exceptId);
  if (open) throw new Error(`A game is already in progress ("${open.location || open.played_on}"). Finish or delete it first.`);
}
function assertNoActiveRummy(d: DemoStore, groupId: string | null, exceptId?: string) {
  const active = d.rummyGames.find((x) => x.group_id === groupId && x.status === 'active' && x.id !== exceptId);
  if (active) throw new Error(`"${active.name || 'Rummy'}" is still in progress. Close or delete it before starting another rummy game.`);
}

/** A rummy game's line in its group's History (SPEC RUMMY-13), named like "Game 1". */
function logRummy(d: DemoStore, g: RummyGame, summary: (name: string) => string) {
  if (g.group_id) log(d, g.group_id, 'rummy', g.id, summary(`"${g.name || 'Rummy'}"`));
}

/** Mirrors is_group_member(): any member can add, edit, delete, or restore an expense (0025). */
function assertMember(d: DemoStore, g: Group, message: string) {
  if (!g.members.some((m) => m.user_id === d.me.id)) throw new Error(message);
}

/** Mirrors the server's is_game_host(): only whoever started a game (or, for old games with no
 *  recorded host, a group admin) can change it. */
function assertHost(d: DemoStore, g: Group, sessionId: string) {
  const s = g.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error('That game no longer exists');
  const host = s.created_by ? s.created_by === d.me.id : g.members.some((m) => m.user_id === d.me.id && m.is_admin);
  if (!host) throw new Error('Only the person who started this game can change it');
}

function rummyGame(d: DemoStore, id: string): RummyGame {
  const g = d.rummyGames.find((x) => x.id === id);
  if (!g) throw new Error('That rummy game no longer exists');
  return g;
}

/** Only "me" has a real, editable avatar in demo mode; every other player is a fixed sample identity. */
function withRummyAvatars(d: DemoStore, g: RummyGame): RummyGame {
  return { ...g, players: g.players.map((p) => ({ ...p, avatar_url: p.user_id === d.me.id ? d.me.avatar_url : null })) };
}

export const demoApi: DataApi = {
  mode: 'demo',

  loadAll: () => mutate((d) => {
    const clone = structuredClone(d);
    // Demo "friends" are fixed sample identities with no real account; only the signed-in
    // user's own avatar is ever editable, so mirror it onto their own memberships/contacts.
    const avatarFor = (uid: string | null) => (uid === clone.me.id ? clone.me.avatar_url : null);
    clone.groups.forEach((g) => g.members.forEach((m) => { m.avatar_url = avatarFor(m.user_id); }));
    clone.contacts.forEach((c) => { c.avatar_url = avatarFor(c.user_id); });
    return clone;
  }),

  updateProfile: (patch) => mutate((d) => {
    d.me = { ...d.me, ...patch };
    // Same as the server's 0020 triggers: your name follows you into every linked row.
    if (patch.display_name) {
      const n = patch.display_name;
      d.groups.forEach((g) => g.members.forEach((m) => { if (m.user_id === d.me.id) m.name = n; }));
      d.contacts.forEach((c) => { if (c.user_id === d.me.id) c.name = n; });
      d.rummyGames.forEach((g) => g.players.forEach((p) => { if (p.user_id === d.me.id) p.name = n; }));
    }
  }),

  uploadAvatar: async (blob) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read that image'));
      reader.readAsDataURL(blob);
    });
    return mutate((d) => { d.me.avatar_url = dataUrl; });
  },

  removeAvatar: () => mutate((d) => { d.me.avatar_url = null; }),

  createGroup: ({ name, kind, currency, direct }) => mutate((d) => {
    const id = uid();
    d.groups.push({
      id, name, kind, currency, is_direct: !!direct, created_by: d.me.id, created_at: now(),
      members: [{ id: uid(), group_id: id, user_id: d.me.id, contact_id: null, name: d.me.display_name, email: d.me.email, email_opt_out: false, is_admin: true }],
      expenses: [], deleted_expenses: [], sessions: [], settlements: [],
    });
    return id;
  }),

  updateGroup: (id, patch) => mutate((d) => {
    const g = group(d, id);
    assertAdmin(d, g, 'Only a group admin can change these settings');
    // Same as the server (0026): Poker, Expense, or Rummy is fixed when the group is made.
    if (patch.kind && patch.kind !== g.kind) throw new Error("A group's type can't be changed");
    Object.assign(g, patch);
    log(d, id, 'group', id, 'Updated group settings');
  }),

  deleteGroup: (id) => mutate((d) => {
    const g = group(d, id);
    assertAdmin(d, g, 'Only a group admin can delete the group');
    // Same as the server (0006 / 0018): only once everyone's total balance is zero.
    if (!isGroupSettled(g)) throw new Error('Settle up everyone in this group before deleting it');
    d.groups = d.groups.filter((x) => x.id !== id);
  }),

  addMember: (groupId, name, email) => mutate((d) => {
    const g = group(d, groupId);
    const c = upsertContact(d, name, email);
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, email_opt_out: false, is_admin: false });
    log(d, groupId, 'member', id, `Added ${c.name} to the group`);
    return id;
  }),

  addMemberFromContact: (groupId, contactId) => mutate((d) => {
    const g = group(d, groupId);
    const c = d.contacts.find((x) => x.id === contactId);
    if (!c) throw new Error('That friend is not in your list');
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, email_opt_out: false, is_admin: false });
    log(d, groupId, 'member', id, `Added ${c.name} to the group`);
    return id;
  }),

  // Same as 0023's admin_update_person (the demo user stands in for the app admin).
  updatePerson: (memberId, name, email) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    const m = g.members.find((m) => m.id === memberId)!;
    if (m.user_id) throw new Error('They have an account, so their name comes from their profile');
    const before = m.name, oldEmail = m.email?.toLowerCase() || null, em = email?.trim().toLowerCase() || null;
    const same = (x: { user_id: string | null; email: string | null }) => !x.user_id && !!oldEmail && x.email?.toLowerCase() === oldEmail;
    d.groups.forEach((gr) => gr.members.forEach((x) => { if (x === m || same(x)) { x.name = name; x.email = em; } }));
    d.contacts.forEach((c) => { if (same(c) || c.id === m.contact_id) { c.name = name; c.email = em; } });
    log(d, g.id, 'member', memberId, name !== before ? `Renamed ${before} to ${name}` : `Changed ${name}'s email`);
  }),

  removeMember: (memberId) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    const name = g.members.find((m) => m.id === memberId)!.name;
    // Same as the server (0005): removing them would rewrite everyone's balances.
    if (memberHasActivity(g, memberId)) throw new Error("This member has games, expenses, or payments and can't be removed");
    g.members = g.members.filter((m) => m.id !== memberId);
    log(d, g.id, 'member', memberId, `Removed ${name} from the group`);
  }),

  setEmailOptOut: (memberId, optOut) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    g.members.find((m) => m.id === memberId)!.email_opt_out = optOut;
  }),

  setGroupAdmin: (memberId, isAdmin) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    assertAdmin(d, g, 'Only a group admin can change admin status');
    const m = g.members.find((m) => m.id === memberId)!;
    if (m.is_admin && !isAdmin && !g.members.some((x) => x.id !== memberId && x.is_admin)) {
      throw new Error('A group needs at least one admin');
    }
    m.is_admin = isAdmin;
    log(d, g.id, 'member', memberId, `${isAdmin ? 'Made' : 'Removed'} ${m.name} ${isAdmin ? 'an admin' : 'as admin'}`);
  }),

  addContact: (name, email) => mutate((d) => upsertContact(d, name, email).id),

  deleteContact: (contactId) => mutate((d) => {
    d.contacts = d.contacts.filter((c) => c.id !== contactId);
    d.groups.forEach((g) => g.members.forEach((m) => { if (m.contact_id === contactId) m.contact_id = null; }));
  }),

  removeFriend: (key, contactId) => mutate((d) => {
    d.hidden_friends = [...new Set([...(d.hidden_friends ?? []), key])];
    if (contactId) {
      d.contacts = d.contacts.filter((c) => c.id !== contactId);
      d.groups.forEach((g) => g.members.forEach((m) => { if (m.contact_id === contactId) m.contact_id = null; }));
    }
  }),

  saveExpense: (e, id) => mutate((d) => {
    const g = group(d, e.group_id);
    assertMember(d, g, 'You are not in this group');
    if (id) {
      const i = g.expenses.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('That expense no longer exists');
      g.expenses[i] = { ...g.expenses[i], ...e };
      log(d, g.id, 'expense', id, `Updated expense "${e.description}"`);
    } else {
      const newId = uid();
      g.expenses.push({ ...e, id: newId, created_at: now(), created_by: d.me.id });
      log(d, g.id, 'expense', newId, `Added expense "${e.description}"`);
    }
  }),

  deleteExpense: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.expenses.some((e) => e.id === id));
    assertMember(d, g, 'You are not in this group');
    const e = g.expenses.find((x) => x.id === id)!;
    g.expenses = g.expenses.filter((x) => x.id !== id);
    (g.deleted_expenses ??= []).push({ ...e, deleted_at: now() });
    log(d, g.id, 'expense', id, `Deleted expense "${e.description}"`);
  }),

  restoreExpense: (id) => mutate((d) => {
    const g = groupOf(d, (x) => (x.deleted_expenses ?? []).some((e) => e.id === id));
    assertMember(d, g, 'You are not in this group');
    const e = g.deleted_expenses!.find((x) => x.id === id)!;
    g.deleted_expenses = g.deleted_expenses!.filter((x) => x.id !== id);
    g.expenses.push({ ...e, deleted_at: null });
    log(d, g.id, 'expense', id, `Restored expense "${e.description}"`);
  }),

  createSession: (s) => mutate((d) => {
    assertNoOpenGame(group(d, s.group_id));
    const id = uid();
    group(d, s.group_id).sessions.push({ ...s, id, status: 'open', created_by: d.me.id, created_at: now(), results: [] });
    log(d, s.group_id, 'session', id, `Started a game${s.location ? ` at ${s.location}` : ''}`);
    return id;
  }),

  updateSession: (id, patch) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    assertHost(d, g, id);
    const before = g.sessions.find((s) => s.id === id)!;
    const wasFinal = before.status === 'final';
    if (patch.status === 'open' && wasFinal) assertNoOpenGame(g, id);
    Object.assign(before, patch);
    if (patch.status === 'final' && !wasFinal) log(d, g.id, 'session', id, 'Finalized the game');
    else if (patch.status === 'open' && wasFinal) log(d, g.id, 'session', id, 'Reopened the game');
    else if (patch.status === undefined) log(d, g.id, 'session', id, 'Updated game details');
  }),

  saveSessionResults: (id, results) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    assertHost(d, g, id);
    g.sessions.find((s) => s.id === id)!.results = results;
  }),

  deleteSession: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    assertHost(d, g, id);
    const game = g.sessions.find((s) => s.id === id)!, location = game.location;
    if (game.status === 'final' && !isSessionSettled(g, game)) throw new Error('Settle up everyone in this game before deleting it');
    g.sessions = g.sessions.filter((s) => s.id !== id);
    // Same as the server (0025): a game's own payments go with it, so balances stay as before the
    // game, and both come back if it's restored.
    (g.deleted_sessions ??= []).push({ ...game, deleted_at: now(), payments: g.settlements.filter((s) => s.session_id === id) });
    g.settlements = g.settlements.filter((s) => s.session_id !== id);
    log(d, g.id, 'session', id, `Deleted the game${location ? ` at ${location}` : ''}`);
  }),

  restoreSession: (id) => mutate((d) => {
    const g = groupOf(d, (x) => (x.deleted_sessions ?? []).some((s) => s.id === id));
    const s = g.deleted_sessions!.find((x) => x.id === id)!;
    if (s.created_by ? s.created_by !== d.me.id : !g.members.some((m) => m.user_id === d.me.id && m.is_admin)) {
      throw new Error('Only the person who started this game can restore it');
    }
    if (s.status === 'open') assertNoOpenGame(g);
    const { payments = [], ...game } = s;
    g.deleted_sessions = g.deleted_sessions!.filter((x) => x.id !== id);
    g.sessions.push({ ...game, deleted_at: null });
    g.settlements.push(...payments);
    log(d, g.id, 'session', id, `Restored the game${s.location ? ` at ${s.location}` : ''}`);
  }),

  addSettlement: (s) => mutate((d) => {
    const g = group(d, s.group_id);
    if (s.session_id) assertHost(d, g, s.session_id);
    const id = uid();
    g.settlements.push({ ...s, id, created_at: now() });
    const name = (mid: string) => g.members.find((m) => m.id === mid)?.name ?? 'someone';
    log(d, g.id, 'settlement', s.session_id ?? null, `Recorded a payment: ${name(s.from_member)} → ${name(s.to_member)}`);
  }),

  deleteSettlement: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.settlements.some((s) => s.id === id));
    const before = g.settlements.find((s) => s.id === id)!;
    if (before.session_id) assertHost(d, g, before.session_id);
    const name = (mid: string) => g.members.find((m) => m.id === mid)?.name ?? 'someone';
    g.settlements = g.settlements.filter((s) => s.id !== id);
    log(d, g.id, 'settlement', before.session_id, `Deleted a payment: ${name(before.from_member)} → ${name(before.to_member)}`);
  }),

  loadHistory: (groupId) => mutate((d) => d.changeLog.filter((c) => c.group_id === groupId).slice().reverse()),

  loadNotifications: () => mutate((d) => d.changeLog.slice().reverse().slice(0, 50)),

  markNotificationsSeen: () => mutate((d) => { d.me.notifications_seen_at = now(); }),

  // Admin analytics reads real signup/activity data across every user, which demo mode has
  // no equivalent of; the admin page is gated to one real account anyway, so this never runs.
  loadAdminOverview: () => Promise.resolve(null),
  loadAdminDailyActivity: () => Promise.resolve([]),
  loadAdminRecentSignups: () => Promise.resolve([]),

  loadRummyGames: (groupId) => mutate((d) =>
    d.rummyGames.filter((g) => g.group_id === groupId).map((g) => withRummyAvatars(d, g)).sort((a, b) => b.created_at.localeCompare(a.created_at))),

  loadRummyGame: (id) => mutate((d) => {
    const g = d.rummyGames.find((x) => x.id === id);
    return g ? withRummyAvatars(d, g) : null;
  }),

  createRummyGame: ({ groupId, name, pointLimit, buyInCents, players }) => mutate((d) => {
    // Same as the server (0026): every rummy game lives in a Rummy group.
    if (!groupId || d.groups.find((g) => g.id === groupId)?.kind !== 'rummy') throw new Error('Rummy games are played in a Rummy group');
    assertNoActiveRummy(d, groupId);
    if (players.length < 2) throw new Error('Add at least two players');
    if (players.length > RUMMY_MAX_PLAYERS) throw new Error(`A rummy table takes up to ${RUMMY_MAX_PLAYERS} players`);
    if (buyInCents < 0) throw new Error("The buy-in can't be negative");
    const id = uid();
    const rummyPlayers: RummyPlayer[] = players.map((p) => ({ id: uid(), rummy_game_id: id, user_id: p.userId, name: p.name, rejoins: 0, score_offset: 0 }));
    d.rummyGames.push({
      id, group_id: groupId, name: name.trim() || null, point_limit: pointLimit, buy_in_cents: buyInCents, session_id: null, status: 'active',
      scorer_id: d.me.id, winner_player_id: null, created_at: now(), finished_at: null,
      players: rummyPlayers, rounds: [],
    });
    logRummy(d, d.rummyGames[d.rummyGames.length - 1]!, (n) => `Started rummy game ${n}`);
    return id;
  }),

  addRummyRound: (gameId, scores) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can add rounds');
    if (g.status !== 'active') throw new Error('This game is already finished');
    const roundNo = (g.rounds[g.rounds.length - 1]?.round_no ?? 0) + 1;
    g.rounds.push({ id: uid(), round_no: roundNo, created_at: now(), scores: scores.map((s) => ({ player_id: s.playerId, points: s.points })) });
    logRummy(d, g, (n) => `Added round ${roundNo} in ${n}`);
    const remaining = rummyStandings(g).filter((s) => !s.eliminated);
    if (remaining.length <= 1) {
      g.status = 'finished';
      g.finished_at = now();
      g.winner_player_id = remaining[0]?.player.id ?? null;
    }
  }),

  updateRummyRound: (roundId, scores) => mutate((d) => {
    const g = d.rummyGames.find((x) => x.rounds.some((r) => r.id === roundId));
    if (!g) throw new Error('That round no longer exists');
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can edit this round');
    const round = g.rounds.find((r) => r.id === roundId)!;
    const points = new Map(scores.map((s) => [s.playerId, s.points]));
    round.scores = round.scores.map((s) => ({ player_id: s.player_id, points: points.get(s.player_id) ?? s.points }));
    const remaining = rummyStandings(g).filter((s) => !s.eliminated);
    const before = { status: g.status, winner: g.winner_player_id };
    if (remaining.length <= 1) {
      g.status = 'finished';
      g.finished_at = g.finished_at ?? now();
      g.winner_player_id = remaining[0]?.player.id ?? null;
    } else {
      // Back in play only if nothing else is (an error here saves nothing).
      if (g.status === 'finished') assertNoActiveRummy(d, g.group_id, g.id);
      g.status = 'active';
      g.finished_at = null;
      g.winner_player_id = null;
    }
    // Same as the server (0030): a changed result takes the old payout out of the balances.
    if (g.session_id && (g.status !== before.status || g.winner_player_id !== before.winner)) {
      const owner = d.groups.find((x) => x.id === g.group_id);
      if (owner?.settlements.some((s) => s.session_id === g.session_id)) throw new Error('Undo the payments marked for this game first, then change the round');
      if (owner) owner.sessions = owner.sessions.filter((s) => s.id !== g.session_id);
      g.session_id = null;
      logRummy(d, g, (n) => `Took ${n} payout out of balances`);
    }
    logRummy(d, g, (n) => `Changed round ${round.round_no} in ${n}`);
  }),

  rejoinRummyPlayer: (playerId, startAt) => mutate((d) => {
    const g = d.rummyGames.find((x) => x.players.some((p) => p.id === playerId));
    if (!g) throw new Error('That player no longer exists');
    if (g.scorer_id !== d.me.id || g.status !== 'active') throw new Error('Only the scorer can bring a player back, while the game is active');
    const standings = rummyStandings(g);
    const me = standings.find((s) => s.player.id === playerId)!;
    if (!me.eliminated) throw new Error('That player is still in');
    const active = standings.filter((s) => !s.eliminated);
    if (active.length < 2) throw new Error('Rejoining needs at least two players still in');
    // Same as the server (0028): any start from 0 up to one below the limit.
    if (!Number.isInteger(startAt) || startAt < 0 || startAt >= g.point_limit) throw new Error(`Pick a starting score from 0 to below ${g.point_limit}`);
    const p = g.players.find((x) => x.id === playerId)!;
    p.rejoins += 1;
    p.score_offset += startAt - me.total;
    logRummy(d, g, (n) => `Brought ${p.name} back into ${n}`);
  }),

  postRummyPayout: (gameId, results) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id || g.status !== 'finished' || g.session_id || !g.group_id) {
      throw new Error("This game was already added to the group's balances, or it isn't yours to add");
    }
    const id = uid();
    group(d, g.group_id).sessions.push({
      id, group_id: g.group_id, played_on: now().slice(0, 10), location: `Rummy${g.name ? `: ${g.name}` : ''}`, notes: null,
      status: 'final', default_buy_in_cents: g.buy_in_cents, created_by: d.me.id, created_at: now(),
      results: results.map((r) => ({ ...r, returned_cents: 0 })),
    });
    g.session_id = id;
    logRummy(d, g, (n) => `Added ${n} payout to balances`);
    return id;
  }),

  closeRummyGame: (gameId) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can close this game');
    if (g.status !== 'active') throw new Error('This game is already finished');
    const remaining = rummyStandings(g).filter((s) => !s.eliminated);
    g.status = 'finished';
    g.finished_at = now();
    g.winner_player_id = remaining.length === 1 ? remaining[0]!.player.id : null;
    logRummy(d, g, (n) => `Closed rummy game ${n}`);
  }),

  deleteRummyGame: (gameId) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can delete this game');
    // Same as the server (0029): its payout in the balances must be settled, and goes with it.
    const owner = g.group_id ? d.groups.find((x) => x.id === g.group_id) : undefined;
    const payout = owner && g.session_id ? owner.sessions.find((s) => s.id === g.session_id) : undefined;
    if (owner && payout) {
      if (!isSessionSettled(owner, payout)) throw new Error('Settle up everyone in this game before deleting it');
      owner.sessions = owner.sessions.filter((s) => s.id !== payout.id);
      owner.settlements = owner.settlements.filter((s) => s.session_id !== payout.id);
    }
    d.rummyGames = d.rummyGames.filter((x) => x.id !== gameId);
    logRummy(d, g, (n) => `Deleted rummy game ${n}`);
  }),
};
