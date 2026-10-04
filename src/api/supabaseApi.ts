/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import type { AppData, ChangeLogEntry, Contact, Group, Profile, RummyGame } from '../lib/types';
import type { AdminDailyActivity, AdminOverview, AdminSignup, DataApi } from './types';

function db() {
  if (!supabase) throw new Error('Supabase is not configured. Add your keys to .env.local.');
  return supabase;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function currentUser() {
  const { data } = await db().auth.getUser();
  if (!data.user) throw new Error('Your session expired. Sign in again.');
  return data.user;
}

/** Best-effort activity log entry. Never blocks or fails the write it's attached to. */
async function log(groupId: string, entityType: ChangeLogEntry['entity_type'], entityId: string | null, summary: string) {
  try {
    const user = await currentUser();
    await db().from('change_log').insert({ group_id: groupId, actor_id: user.id, entity_type: entityType, entity_id: entityId, summary });
  } catch {
    /* history is a nice-to-have; a logging failure must never surface as an action failure */
  }
}

const GROUP_SELECT = `
  id, name, kind, currency, is_direct, created_by, created_at,
  group_members ( id, group_id, user_id, contact_id, name, email, email_opt_out, is_admin ),
  expenses ( id, group_id, description, category, amount_cents, spent_on, created_by, created_at, deleted_at,
    expense_payers ( member_id, amount_cents ), expense_shares ( member_id, amount_cents ) ),
  game_sessions ( id, group_id, played_on, location, notes, status, default_buy_in_cents, created_by, created_at,
    session_results ( member_id, buy_in_cents, cash_out_cents, returned_cents ) ),
  settlements ( id, group_id, from_member, to_member, amount_cents, method, note, session_id, settled_on, created_at )
`;

const num = (v: any) => Number(v ?? 0);
const HOST_ONLY = 'Only the person who started this game can change it';

// rummy_players is named explicitly (rummy_players_rummy_game_id_fkey) because rummy_games also
// has a second FK to it (winner_player_id) -- without this, PostgREST can't tell which
// relationship to embed and the query fails outright.
const RUMMY_SELECT = `
  id, group_id, name, point_limit, buy_in_cents, session_id, status, scorer_id, winner_player_id, created_at, finished_at,
  rummy_players!rummy_players_rummy_game_id_fkey ( id, rummy_game_id, user_id, name, rejoins, score_offset ),
  rummy_rounds ( id, round_no, created_at, rummy_round_scores ( player_id, points ) )
`;

function mapRummyGame(r: any): RummyGame {
  return {
    id: r.id, group_id: r.group_id, name: r.name, point_limit: r.point_limit, buy_in_cents: num(r.buy_in_cents), session_id: r.session_id, status: r.status,
    scorer_id: r.scorer_id, winner_player_id: r.winner_player_id, created_at: r.created_at, finished_at: r.finished_at,
    players: (r.rummy_players ?? []).map((p: any) => ({ ...p, rejoins: num(p.rejoins), score_offset: num(p.score_offset) })),
    rounds: (r.rummy_rounds ?? [])
      .map((rr: any) => ({
        id: rr.id, round_no: rr.round_no, created_at: rr.created_at,
        scores: (rr.rummy_round_scores ?? []).map((s: any) => ({ player_id: s.player_id, points: num(s.points) })),
      }))
      .sort((a: any, b: any) => a.round_no - b.round_no),
  };
}

/** Same live-avatar lookup as loadAll, scoped to this batch of rummy games. */
async function attachRummyAvatars(games: RummyGame[]) {
  const userIds = new Set<string>();
  games.forEach((g) => g.players.forEach((p) => { if (p.user_id) userIds.add(p.user_id); }));
  if (!userIds.size) return;
  const avatars = check(await db().rpc('linked_avatars', { p_user_ids: [...userIds] })) as { id: string; avatar_url: string | null }[];
  const map = new Map(avatars.map((a) => [a.id, a.avatar_url]));
  games.forEach((g) => g.players.forEach((p) => { if (p.user_id) p.avatar_url = map.get(p.user_id) ?? null; }));
}

function mapExpense(e: any) {
  return {
    id: e.id, group_id: e.group_id, description: e.description, category: e.category,
    amount_cents: num(e.amount_cents), spent_on: e.spent_on, created_by: e.created_by, created_at: e.created_at, deleted_at: e.deleted_at,
    payers: (e.expense_payers ?? []).map((p: any) => ({ member_id: p.member_id, amount_cents: num(p.amount_cents) })),
    shares: (e.expense_shares ?? []).map((p: any) => ({ member_id: p.member_id, amount_cents: num(p.amount_cents) })),
  };
}

function mapGroup(r: any): Group {
  const expenses = (r.expenses ?? []).map(mapExpense);
  return {
    id: r.id, name: r.name, kind: r.kind, currency: r.currency, is_direct: !!r.is_direct, created_by: r.created_by, created_at: r.created_at,
    members: (r.group_members ?? []).map((m: any) => ({ ...m })),
    expenses: expenses.filter((e: any) => !e.deleted_at),
    deleted_expenses: expenses.filter((e: any) => e.deleted_at),
    sessions: (r.game_sessions ?? []).map((s: any) => ({
      id: s.id, group_id: s.group_id, played_on: s.played_on, location: s.location, notes: s.notes, status: s.status,
      default_buy_in_cents: num(s.default_buy_in_cents), created_by: s.created_by, created_at: s.created_at,
      results: (s.session_results ?? []).map((x: any) => ({
        member_id: x.member_id, buy_in_cents: num(x.buy_in_cents), cash_out_cents: num(x.cash_out_cents), returned_cents: num(x.returned_cents),
      })),
    })),
    settlements: (r.settlements ?? []).map((s: any) => ({ ...s, amount_cents: num(s.amount_cents) })),
  };
}

export const supabaseApi: DataApi = {
  mode: 'supabase',

  async loadAll(): Promise<AppData> {
    const user = await currentUser();
    // Best-effort usage ping; never blocks or fails the load it's attached to.
    db().rpc('record_visit').then(() => {}, () => {});
    let profile = check(await db().from('profiles').select('*').eq('id', user.id).maybeSingle()) as Profile | null;
    if (!profile) {
      const meta = user.user_metadata ?? {};
      profile = check(await db().from('profiles').insert({
        id: user.id,
        display_name: meta.full_name ?? meta.name ?? (user.email ?? 'Me').split('@')[0],
        email: (user.email ?? '').toLowerCase(),
        avatar_url: meta.avatar_url ?? null,
      }).select('*').single()) as Profile;
    }
    const rows = check(await db().from('groups').select(GROUP_SELECT).order('created_at')) as any[];
    const contacts = check(await db().from('contacts').select('*').order('name')) as Contact[];
    const groups = rows.map(mapGroup);

    // Avatars aren't denormalized onto members/contacts; fetch them for everyone we're
    // actually linked to (shared group or contact) so a changed photo shows up everywhere live.
    const userIds = new Set<string>();
    groups.forEach((g) => g.members.forEach((m) => { if (m.user_id) userIds.add(m.user_id); }));
    contacts.forEach((c) => { if (c.user_id) userIds.add(c.user_id); });
    if (userIds.size) {
      const avatars = check(await db().rpc('linked_avatars', { p_user_ids: [...userIds] })) as { id: string; avatar_url: string | null }[];
      const map = new Map(avatars.map((a) => [a.id, a.avatar_url]));
      groups.forEach((g) => g.members.forEach((m) => { if (m.user_id) m.avatar_url = map.get(m.user_id) ?? null; }));
      contacts.forEach((c) => { if (c.user_id) c.avatar_url = map.get(c.user_id) ?? null; });
    }

    return { me: profile, groups, contacts };
  },

  async updateProfile(patch) {
    const user = await currentUser();
    // A database trigger (0020) carries a new display name to every group, friends list, and
    // rummy game you're linked in, so it's one name everywhere.
    check(await db().from('profiles').update(patch).eq('id', user.id));
  },

  async uploadAvatar(blob) {
    const user = await currentUser();
    const path = `${user.id}/avatar.jpg`;
    const { error: upErr } = await db().storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (upErr) throw new Error(upErr.message);
    const { data } = db().storage.from('avatars').getPublicUrl(path);
    check(await db().from('profiles').update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` }).eq('id', user.id));
  },

  async removeAvatar() {
    const user = await currentUser();
    await db().storage.from('avatars').remove([`${user.id}/avatar.jpg`]);
    check(await db().from('profiles').update({ avatar_url: null }).eq('id', user.id));
  },

  async createGroup({ name, kind, currency, direct }) {
    return check(await db().rpc('create_group', { p_name: name, p_kind: kind, p_currency: currency, p_direct: !!direct })) as string;
  },

  async updateGroup(id, patch) {
    check(await db().from('groups').update(patch).eq('id', id));
    await log(id, 'group', id, 'Updated group settings');
  },

  async deleteGroup(id) {
    check(await db().from('groups').delete().eq('id', id));
  },

  async addMember(groupId, name, email) {
    const id = check(await db().rpc('add_member', { p_group: groupId, p_name: name, p_email: email })) as string;
    await log(groupId, 'member', id, `Added ${name} to the group`);
    return id;
  },

  async addMemberFromContact(groupId, contactId) {
    const contact = check(await db().from('contacts').select('name').eq('id', contactId).maybeSingle()) as { name: string } | null;
    const id = check(await db().rpc('add_member', { p_group: groupId, p_contact_id: contactId })) as string;
    await log(groupId, 'member', id, `Added ${contact?.name ?? 'a friend'} to the group`);
    return id;
  },

  async updatePerson(memberId, name, email) {
    // 0023: checks is_app_admin(), updates every unlinked row for this person, logs to History.
    check(await db().rpc('admin_update_person', { p_member: memberId, p_name: name, p_email: email }));
  },

  async removeMember(memberId) {
    const before = check(await db().from('group_members').select('group_id, name').eq('id', memberId).maybeSingle()) as { group_id: string; name: string } | null;
    check(await db().from('group_members').delete().eq('id', memberId));
    if (before) await log(before.group_id, 'member', memberId, `Removed ${before.name} from the group`);
  },

  async setEmailOptOut(memberId, optOut) {
    check(await db().from('group_members').update({ email_opt_out: optOut }).eq('id', memberId));
  },

  async setGroupAdmin(memberId, isAdmin) {
    const before = check(await db().from('group_members').select('group_id, name').eq('id', memberId).maybeSingle()) as { group_id: string; name: string } | null;
    check(await db().from('group_members').update({ is_admin: isAdmin }).eq('id', memberId));
    if (before) await log(before.group_id, 'member', memberId, `${isAdmin ? 'Made' : 'Removed'} ${before.name} ${isAdmin ? 'an admin' : 'as admin'}`);
  },

  async addContact(name, email) {
    return check(await db().rpc('upsert_contact', { p_name: name, p_email: email })) as string;
  },

  async deleteContact(contactId) {
    check(await db().from('contacts').delete().eq('id', contactId));
  },

  async saveExpense(e, id) {
    const user = await currentUser();
    const fields = {
      group_id: e.group_id, description: e.description, category: e.category,
      amount_cents: e.amount_cents, spent_on: e.spent_on,
    };
    let expenseId = id;
    if (id) {
      const rows = check(await db().from('expenses').update(fields).eq('id', id).select('id')) as { id: string }[];
      if (!rows.length) throw new Error('Only a group admin can edit expenses');
      check(await db().from('expense_payers').delete().eq('expense_id', id));
      check(await db().from('expense_shares').delete().eq('expense_id', id));
    } else {
      const row = check(await db().from('expenses').insert({ ...fields, created_by: user.id }).select('id').single()) as { id: string };
      expenseId = row.id;
    }
    try {
      const withId = (xs: { member_id: string; amount_cents: number }[]) => xs.map((x) => ({ ...x, expense_id: expenseId }));
      check(await db().from('expense_payers').insert(withId(e.payers)));
      check(await db().from('expense_shares').insert(withId(e.shares)));
    } catch (err) {
      if (!id) await db().from('expenses').delete().eq('id', expenseId!);
      throw err;
    }
    await log(e.group_id, 'expense', expenseId!, id ? `Updated expense "${e.description}"` : `Added expense "${e.description}"`);
  },

  async deleteExpense(id) {
    const before = check(await db().from('expenses').select('group_id, description').eq('id', id).maybeSingle()) as { group_id: string; description: string } | null;
    if (!before) throw new Error('That expense no longer exists');
    // RLS silently skips rows the caller can't update, so ask for the row back to tell "not
    // allowed" apart from success.
    const rows = check(await db().from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')) as { id: string }[];
    if (!rows.length) throw new Error('Only a group admin can delete expenses');
    await log(before.group_id, 'expense', id, `Deleted expense "${before.description}"`);
  },

  async restoreExpense(id) {
    const before = check(await db().from('expenses').select('group_id, description').eq('id', id).maybeSingle()) as { group_id: string; description: string } | null;
    if (!before) throw new Error('That expense no longer exists');
    const rows = check(await db().from('expenses').update({ deleted_at: null }).eq('id', id).select('id')) as { id: string }[];
    if (!rows.length) throw new Error('Only a group admin can restore expenses');
    await log(before.group_id, 'expense', id, `Restored expense "${before.description}"`);
  },

  async createSession(s) {
    const user = await currentUser();
    const row = check(await db().from('game_sessions').insert({ ...s, created_by: user.id }).select('id').single()) as { id: string };
    await log(s.group_id, 'session', row.id, `Started a game${s.location ? ` at ${s.location}` : ''}`);
    return row.id;
  },

  async updateSession(id, patch) {
    const before = check(await db().from('game_sessions').select('group_id, status').eq('id', id).maybeSingle()) as { group_id: string; status: string } | null;
    // RLS skips rows you can't change without an error, so ask for the row back to tell them apart.
    const rows = check(await db().from('game_sessions').update(patch).eq('id', id).select('id')) as { id: string }[];
    if (!rows.length) throw new Error(HOST_ONLY);
    if (!before) return;
    if (patch.status === 'final' && before.status !== 'final') await log(before.group_id, 'session', id, 'Finalized the game');
    else if (patch.status === 'open' && before.status === 'final') await log(before.group_id, 'session', id, 'Reopened the game');
    else if (patch.status === undefined) await log(before.group_id, 'session', id, 'Updated game details');
  },

  async saveSessionResults(id, results) {
    const ids = results.map((r) => r.member_id);
    if (results.length) {
      const res = await db().from('session_results').upsert(results.map((r) => ({ ...r, returned_cents: r.returned_cents ?? 0, session_id: id })), { onConflict: 'session_id,member_id' });
      if (res.error) throw new Error(/row-level security/i.test(res.error.message) ? HOST_ONLY : res.error.message);
    }
    let del = db().from('session_results').delete().eq('session_id', id);
    if (ids.length) del = del.not('member_id', 'in', `(${ids.join(',')})`);
    check(await del);
  },

  async deleteSession(id) {
    const before = check(await db().from('game_sessions').select('group_id, location').eq('id', id).maybeSingle()) as { group_id: string; location: string | null } | null;
    const rows = check(await db().from('game_sessions').delete().eq('id', id).select('id')) as { id: string }[];
    if (!rows.length) throw new Error(HOST_ONLY);
    if (before) await log(before.group_id, 'session', id, `Deleted the game${before.location ? ` at ${before.location}` : ''}`);
  },

  async addSettlement(s) {
    const user = await currentUser();
    const names = check(await db().from('group_members').select('id, name').in('id', [s.from_member, s.to_member])) as { id: string; name: string }[];
    const name = (id: string) => names.find((x) => x.id === id)?.name ?? 'someone';
    check(await db().from('settlements').insert({ ...s, created_by: user.id }));
    await log(s.group_id, 'settlement', s.session_id ?? null, `Recorded a payment: ${name(s.from_member)} → ${name(s.to_member)}`);
  },

  async deleteSettlement(id) {
    const before = check(await db().from('settlements').select('group_id, from_member, to_member, session_id').eq('id', id).maybeSingle()) as
      { group_id: string; from_member: string; to_member: string; session_id: string | null } | null;
    check(await db().from('settlements').delete().eq('id', id));
    if (!before) return;
    const names = check(await db().from('group_members').select('id, name').in('id', [before.from_member, before.to_member])) as { id: string; name: string }[];
    const name = (id: string) => names.find((x) => x.id === id)?.name ?? 'someone';
    await log(before.group_id, 'settlement', before.session_id, `Deleted a payment: ${name(before.from_member)} → ${name(before.to_member)}`);
  },

  async loadHistory(groupId) {
    return check(await db().from('change_log').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(200)) as ChangeLogEntry[];
  },

  async loadNotifications() {
    // RLS already scopes this to groups the caller belongs to, across all of them.
    return check(await db().from('change_log').select('*').order('created_at', { ascending: false }).limit(50)) as ChangeLogEntry[];
  },

  async markNotificationsSeen() {
    const user = await currentUser();
    check(await db().from('profiles').update({ notifications_seen_at: new Date().toISOString() }).eq('id', user.id));
  },

  async loadAdminOverview() {
    const rows = check(await db().rpc('admin_overview')) as AdminOverview[];
    return rows[0] ?? null;
  },

  async loadAdminDailyActivity(days = 30) {
    return check(await db().rpc('admin_daily_activity', { p_days: days })) as AdminDailyActivity[];
  },

  async loadAdminRecentSignups(limit = 20) {
    return check(await db().rpc('admin_recent_signups', { p_limit: limit })) as AdminSignup[];
  },

  async loadRummyGames(groupId) {
    let q = db().from('rummy_games').select(RUMMY_SELECT).order('created_at', { ascending: false });
    q = groupId === null ? q.is('group_id', null) : q.eq('group_id', groupId);
    const rows = check(await q) as any[];
    const games = rows.map(mapRummyGame);
    await attachRummyAvatars(games);
    return games;
  },

  async loadRummyGame(id) {
    const row = check(await db().from('rummy_games').select(RUMMY_SELECT).eq('id', id).maybeSingle()) as any;
    if (!row) return null;
    const game = mapRummyGame(row);
    await attachRummyAvatars([game]);
    return game;
  },

  async createRummyGame({ groupId, name, pointLimit, buyInCents, players }) {
    return check(await db().rpc('create_rummy_game', {
      p_group_id: groupId, p_name: name, p_point_limit: pointLimit, p_buy_in_cents: buyInCents,
      p_players: players.map((p) => ({ name: p.name, user_id: p.userId })),
    })) as string;
  },

  async addRummyRound(gameId, scores) {
    check(await db().rpc('add_rummy_round', {
      p_game_id: gameId,
      p_scores: scores.map((s) => ({ player_id: s.playerId, points: s.points })),
    }));
  },

  async updateRummyRound(roundId, scores) {
    check(await db().rpc('update_rummy_round', {
      p_round_id: roundId,
      p_scores: scores.map((s) => ({ player_id: s.playerId, points: s.points })),
    }));
  },

  async rejoinRummyPlayer(playerId) {
    check(await db().rpc('rejoin_rummy_player', { p_player_id: playerId }));
  },

  async linkRummySession(gameId, sessionId) {
    check(await db().rpc('link_rummy_session', { p_game_id: gameId, p_session_id: sessionId }));
  },

  async closeRummyGame(gameId) {
    check(await db().rpc('close_rummy_game', { p_game_id: gameId }));
  },

  async deleteRummyGame(gameId) {
    check(await db().from('rummy_games').delete().eq('id', gameId));
  },
};
