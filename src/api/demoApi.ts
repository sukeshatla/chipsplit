import type { AppData, Group } from '../lib/types';
import type { DataApi } from './types';
import { seedDemo, uid } from './seed';

const KEY = 'chipsplit_demo_v1';

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch { /* fall through to a fresh seed */ }
  const d = seedDemo();
  save(d);
  return d;
}

function save(d: AppData) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

export function resetDemo() {
  save(seedDemo());
}

const now = () => new Date().toISOString();

/** Apply a change to the stored demo data, with a short delay so loading states are visible. */
function mutate<T>(fn: (d: AppData) => T): Promise<T> {
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

export const demoApi: DataApi = {
  mode: 'demo',

  loadAll: () => mutate((d) => structuredClone(d)),

  updateProfile: (patch) => mutate((d) => {
    d.me = { ...d.me, ...patch };
    if (patch.display_name) {
      d.groups.forEach((g) => g.members.forEach((m) => { if (m.user_id === d.me.id) m.name = patch.display_name!; }));
    }
  }),

  createGroup: ({ name, kind, currency }) => mutate((d) => {
    const id = uid();
    d.groups.push({
      id, name, kind, currency, created_by: d.me.id, created_at: now(),
      members: [{ id: uid(), group_id: id, user_id: d.me.id, name: d.me.display_name, email: d.me.email, role: 'owner' }],
      expenses: [], sessions: [], settlements: [],
    });
    return id;
  }),

  updateGroup: (id, patch) => mutate((d) => { Object.assign(group(d, id), patch); }),

  deleteGroup: (id) => mutate((d) => { d.groups = d.groups.filter((g) => g.id !== id); }),

  addMember: (groupId, name, email) => mutate((d) => {
    const g = group(d, groupId);
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: null, name, email: email?.toLowerCase() || null, role: 'member' });
    return id;
  }),

  renameMember: (memberId, name) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    g.members.find((m) => m.id === memberId)!.name = name;
  }),

  removeMember: (memberId) => mutate((d) => {
    const g = groupOf(d, (x) => x.members.some((m) => m.id === memberId));
    g.members = g.members.filter((m) => m.id !== memberId);
  }),

  saveExpense: (e, id) => mutate((d) => {
    const g = group(d, e.group_id);
    if (id) {
      const i = g.expenses.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('That expense no longer exists');
      g.expenses[i] = { ...g.expenses[i], ...e };
    } else {
      g.expenses.push({ ...e, id: uid(), created_at: now(), created_by: d.me.id });
    }
  }),

  deleteExpense: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.expenses.some((e) => e.id === id));
    g.expenses = g.expenses.filter((e) => e.id !== id);
  }),

  createSession: (s) => mutate((d) => {
    const id = uid();
    group(d, s.group_id).sessions.push({ ...s, id, status: 'open', created_at: now(), results: [] });
    return id;
  }),

  updateSession: (id, patch) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    Object.assign(g.sessions.find((s) => s.id === id)!, patch);
  }),

  saveSessionResults: (id, results) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    g.sessions.find((s) => s.id === id)!.results = results;
  }),

  deleteSession: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    g.sessions = g.sessions.filter((s) => s.id !== id);
    g.settlements.forEach((s) => { if (s.session_id === id) s.session_id = null; });
  }),

  addSettlement: (s) => mutate((d) => { group(d, s.group_id).settlements.push({ ...s, id: uid(), created_at: now() }); }),

  deleteSettlement: (id) => mutate((d) => {
    const g = groupOf(d, (x) => x.settlements.some((s) => s.id === id));
    g.settlements = g.settlements.filter((s) => s.id !== id);
  }),
};
