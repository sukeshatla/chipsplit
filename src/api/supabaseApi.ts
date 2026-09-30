/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import type { AppData, Group, Profile } from '../lib/types';
import type { DataApi } from './types';

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

const GROUP_SELECT = `
  id, name, kind, currency, created_by, created_at,
  group_members ( id, group_id, user_id, name, email, role ),
  expenses ( id, group_id, description, category, amount_cents, spent_on, created_by, created_at,
    expense_payers ( member_id, amount_cents ), expense_shares ( member_id, amount_cents ) ),
  game_sessions ( id, group_id, played_on, location, notes, status, default_buy_in_cents, created_at,
    session_results ( member_id, buy_in_cents, cash_out_cents ) ),
  settlements ( id, group_id, from_member, to_member, amount_cents, method, note, session_id, settled_on, created_at )
`;

const num = (v: any) => Number(v ?? 0);

function mapGroup(r: any): Group {
  return {
    id: r.id, name: r.name, kind: r.kind, currency: r.currency, created_by: r.created_by, created_at: r.created_at,
    members: (r.group_members ?? []).map((m: any) => ({ ...m })),
    expenses: (r.expenses ?? []).map((e: any) => ({
      id: e.id, group_id: e.group_id, description: e.description, category: e.category,
      amount_cents: num(e.amount_cents), spent_on: e.spent_on, created_by: e.created_by, created_at: e.created_at,
      payers: (e.expense_payers ?? []).map((p: any) => ({ member_id: p.member_id, amount_cents: num(p.amount_cents) })),
      shares: (e.expense_shares ?? []).map((p: any) => ({ member_id: p.member_id, amount_cents: num(p.amount_cents) })),
    })),
    sessions: (r.game_sessions ?? []).map((s: any) => ({
      id: s.id, group_id: s.group_id, played_on: s.played_on, location: s.location, notes: s.notes, status: s.status,
      default_buy_in_cents: num(s.default_buy_in_cents), created_at: s.created_at,
      results: (s.session_results ?? []).map((x: any) => ({
        member_id: x.member_id, buy_in_cents: num(x.buy_in_cents), cash_out_cents: num(x.cash_out_cents),
      })),
    })),
    settlements: (r.settlements ?? []).map((s: any) => ({ ...s, amount_cents: num(s.amount_cents) })),
  };
}

export const supabaseApi: DataApi = {
  mode: 'supabase',

  async loadAll(): Promise<AppData> {
    const user = await currentUser();
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
    return { me: profile, groups: rows.map(mapGroup) };
  },

  async updateProfile(patch) {
    const user = await currentUser();
    check(await db().from('profiles').update(patch).eq('id', user.id));
  },

  async createGroup({ name, kind, currency }) {
    return check(await db().rpc('create_group', { p_name: name, p_kind: kind, p_currency: currency })) as string;
  },

  async updateGroup(id, patch) {
    check(await db().from('groups').update(patch).eq('id', id));
  },

  async deleteGroup(id) {
    check(await db().from('groups').delete().eq('id', id));
  },

  async addMember(groupId, name, email) {
    return check(await db().rpc('add_member', { p_group: groupId, p_name: name, p_email: email })) as string;
  },

  async renameMember(memberId, name) {
    check(await db().from('group_members').update({ name }).eq('id', memberId));
  },

  async removeMember(memberId) {
    check(await db().from('group_members').delete().eq('id', memberId));
  },

  async saveExpense(e, id) {
    const user = await currentUser();
    const fields = {
      group_id: e.group_id, description: e.description, category: e.category,
      amount_cents: e.amount_cents, spent_on: e.spent_on,
    };
    let expenseId = id;
    if (id) {
      check(await db().from('expenses').update(fields).eq('id', id));
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
  },

  async deleteExpense(id) {
    check(await db().from('expenses').delete().eq('id', id));
  },

  async createSession(s) {
    const user = await currentUser();
    const row = check(await db().from('game_sessions').insert({ ...s, created_by: user.id }).select('id').single()) as { id: string };
    return row.id;
  },

  async updateSession(id, patch) {
    check(await db().from('game_sessions').update(patch).eq('id', id));
  },

  async saveSessionResults(id, results) {
    const ids = results.map((r) => r.member_id);
    if (results.length) {
      check(await db().from('session_results').upsert(results.map((r) => ({ ...r, session_id: id })), { onConflict: 'session_id,member_id' }));
    }
    let del = db().from('session_results').delete().eq('session_id', id);
    if (ids.length) del = del.not('member_id', 'in', `(${ids.join(',')})`);
    check(await del);
  },

  async deleteSession(id) {
    check(await db().from('game_sessions').delete().eq('id', id));
  },

  async addSettlement(s) {
    const user = await currentUser();
    check(await db().from('settlements').insert({ ...s, created_by: user.id }));
  },

  async deleteSettlement(id) {
    check(await db().from('settlements').delete().eq('id', id));
  },
};
