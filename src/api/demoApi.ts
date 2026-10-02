import type { AppData, ChangeLogEntry, Contact, Group, RummyGame, RummyPlayer } from '../lib/types';
import type { DataApi } from './types';
import { rummyStandings } from '../lib/rummy';
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
      d.groups.forEach((g) => { g.deleted_expenses ??= []; });
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
    return new Promise((res) => setTimeout(() => res(r), 120));
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
    if (existing) { existing.name = name; return existing; }
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
    if (patch.display_name) {
      d.groups.forEach((g) => g.members.forEach((m) => { if (m.user_id === d.me.id) m.name = patch.display_name!; }));
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
    Object.assign(g, patch);
    log(d, id, 'group', id, 'Updated group settings');
  }),

  deleteGroup: (id) => mutate((d) => {
    const g = group(d, id);
    assertAdmin(d, g, 'Only a group admin can delete the group');
    d.groups = d.groups.filter((x) => x.id !== id);
  }),

  addMember: (groupId, name, email) => mutate((d) => {
    const g = group(d, groupId);
    const c = upsertContact(d, name, email);
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, email_opt_out: false, is_admin: true });
    log(d, groupId, 'member', id, `Added ${c.name} to the group`);
    return id;
  }),

  addMemberFromContact: (groupId, contactId) => mutate((d) => {
    const g = group(d, groupId);
    const c = d.contacts.find((x) => x.id === contactId);
    if (!c) throw new Error('That friend is not in your list');
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, email_opt_out: false, is_admin: true });
    log(d, groupId, 'member', id, `Added ${c.name} to the group`);
    return id;
  }),

  renameMember: (memberId, name) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    const m = g.members.find((m) => m.id === memberId)!;
    const before = m.name;
    m.name = name;
    log(d, g.id, 'member', memberId, `Renamed ${before} to ${name}`);
  }),

  removeMember: (memberId) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    const name = g.members.find((m) => m.id === memberId)!.name;
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

  renameContact: (contactId, name) => mutate((d) => {
    const c = d.contacts.find((x) => x.id === contactId);
    if (c) c.name = name;
  }),

  deleteContact: (contactId) => mutate((d) => {
    d.contacts = d.contacts.filter((c) => c.id !== contactId);
    d.groups.forEach((g) => g.members.forEach((m) => { if (m.contact_id === contactId) m.contact_id = null; }));
  }),

  saveExpense: (e, id) => mutate((d) => {
    const g = group(d, e.group_id);
    assertAdmin(d, g, id ? 'Only a group admin can edit expenses' : 'Only a group admin can add expenses');
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
    assertAdmin(d, g, 'Only a group admin can delete expenses');
    const e = g.expenses.find((x) => x.id === id)!;
    g.expenses = g.expenses.filter((x) => x.id !== id);
    (g.deleted_expenses ??= []).push({ ...e, deleted_at: now() });
    log(d, g.id, 'expense', id, `Deleted expense "${e.description}"`);
  }),

  restoreExpense: (id) => mutate((d) => {
    const g = groupOf(d, (x) => (x.deleted_expenses ?? []).some((e) => e.id === id));
    assertAdmin(d, g, 'Only a group admin can restore expenses');
    const e = g.deleted_expenses!.find((x) => x.id === id)!;
    g.deleted_expenses = g.deleted_expenses!.filter((x) => x.id !== id);
    g.expenses.push({ ...e, deleted_at: null });
    log(d, g.id, 'expense', id, `Restored expense "${e.description}"`);
  }),

  createSession: (s) => mutate((d) => {
    const id = uid();
    group(d, s.group_id).sessions.push({ ...s, id, status: 'open', created_at: now(), results: [] });
    log(d, s.group_id, 'session', id, `Started a game${s.location ? ` at ${s.location}` : ''}`);
    return id;
  }),

  updateSession: (id, patch) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    const before = g.sessions.find((s) => s.id === id)!;
    const wasFinal = before.status === 'final';
    Object.assign(before, patch);
    if (patch.status === 'final' && !wasFinal) log(d, g.id, 'session', id, 'Finalized the game');
    else if (patch.status === 'open' && wasFinal) log(d, g.id, 'session', id, 'Reopened the game');
    else if (patch.status === undefined) log(d, g.id, 'session', id, 'Updated game details');
  }),

  saveSessionResults: (id, results) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    g.sessions.find((s) => s.id === id)!.results = results;
  }),

  deleteSession: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    const location = g.sessions.find((s) => s.id === id)!.location;
    g.sessions = g.sessions.filter((s) => s.id !== id);
    g.settlements.forEach((s) => { if (s.session_id === id) s.session_id = null; });
    log(d, g.id, 'session', id, `Deleted the game${location ? ` at ${location}` : ''}`);
  }),

  addSettlement: (s) => mutate((d) => {
    const g = group(d, s.group_id);
    const id = uid();
    g.settlements.push({ ...s, id, created_at: now() });
    const name = (mid: string) => g.members.find((m) => m.id === mid)?.name ?? 'someone';
    log(d, g.id, 'settlement', s.session_id ?? null, `Recorded a payment: ${name(s.from_member)} → ${name(s.to_member)}`);
  }),

  deleteSettlement: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.settlements.some((s) => s.id === id));
    const before = g.settlements.find((s) => s.id === id)!;
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
    if (players.length < 2) throw new Error('Add at least two players');
    if (buyInCents < 0) throw new Error("The buy-in can't be negative");
    const id = uid();
    const rummyPlayers: RummyPlayer[] = players.map((p) => ({ id: uid(), rummy_game_id: id, user_id: p.userId, name: p.name, rejoins: 0, score_offset: 0 }));
    d.rummyGames.push({
      id, group_id: groupId, name: name.trim() || null, point_limit: pointLimit, buy_in_cents: buyInCents, session_id: null, status: 'active',
      scorer_id: d.me.id, winner_player_id: null, created_at: now(), finished_at: null,
      players: rummyPlayers, rounds: [],
    });
    return id;
  }),

  addRummyRound: (gameId, scores) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can add rounds');
    if (g.status !== 'active') throw new Error('This game is already finished');
    const roundNo = (g.rounds[g.rounds.length - 1]?.round_no ?? 0) + 1;
    g.rounds.push({ id: uid(), round_no: roundNo, created_at: now(), scores: scores.map((s) => ({ player_id: s.playerId, points: s.points })) });
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
    if (remaining.length <= 1) {
      g.status = 'finished';
      g.finished_at = g.finished_at ?? now();
      g.winner_player_id = remaining[0]?.player.id ?? null;
    } else {
      g.status = 'active';
      g.finished_at = null;
      g.winner_player_id = null;
    }
  }),

  rejoinRummyPlayer: (playerId) => mutate((d) => {
    const g = d.rummyGames.find((x) => x.players.some((p) => p.id === playerId));
    if (!g) throw new Error('That player no longer exists');
    if (g.scorer_id !== d.me.id || g.status !== 'active') throw new Error('Only the scorer can bring a player back, while the game is active');
    const standings = rummyStandings(g);
    const me = standings.find((s) => s.player.id === playerId)!;
    if (!me.eliminated) throw new Error('That player is still in');
    const active = standings.filter((s) => !s.eliminated);
    if (active.length < 2) throw new Error('Rejoining needs at least two players still in');
    const top = Math.max(...active.map((s) => s.total));
    const p = g.players.find((x) => x.id === playerId)!;
    p.rejoins += 1;
    p.score_offset += top - me.total;
  }),

  linkRummySession: (gameId, sessionId) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id || g.status !== 'finished' || g.session_id) {
      throw new Error("This game was already added to the club, or it isn't yours to add");
    }
    g.session_id = sessionId;
  }),

  closeRummyGame: (gameId) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can close this game');
    if (g.status !== 'active') throw new Error('This game is already finished');
    const remaining = rummyStandings(g).filter((s) => !s.eliminated);
    g.status = 'finished';
    g.finished_at = now();
    g.winner_player_id = remaining.length === 1 ? remaining[0]!.player.id : null;
  }),

  deleteRummyGame: (gameId) => mutate((d) => {
    const g = rummyGame(d, gameId);
    if (g.scorer_id !== d.me.id) throw new Error('Only the scorer can delete this game');
    d.rummyGames = d.rummyGames.filter((x) => x.id !== gameId);
  }),
};
