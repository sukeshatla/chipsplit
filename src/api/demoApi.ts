import type { AppData, ChangeLogEntry, Contact, Group } from '../lib/types';
import type { DataApi } from './types';
import { seedDemo, uid } from './seed';

const KEY = 'chipsplit_demo_v1';

/** The demo store keeps the activity log alongside AppData; it's not part of the public shape. */
type DemoStore = AppData & { changeLog: ChangeLogEntry[] };

function load(): DemoStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as DemoStore;
      d.changeLog ??= [];
      return d;
    }
  } catch { /* fall through to a fresh seed */ }
  const d: DemoStore = { ...seedDemo(), changeLog: [] };
  save(d);
  return d;
}

function save(d: DemoStore) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

export function resetDemo() {
  save({ ...seedDemo(), changeLog: [] });
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
      members: [{ id: uid(), group_id: id, user_id: d.me.id, contact_id: null, name: d.me.display_name, email: d.me.email, role: 'owner', email_opt_out: false }],
      expenses: [], sessions: [], settlements: [],
    });
    return id;
  }),

  updateGroup: (id, patch) => mutate((d) => { Object.assign(group(d, id), patch); log(d, id, 'group', id, 'Updated group settings'); }),

  deleteGroup: (id) => mutate((d) => { d.groups = d.groups.filter((g) => g.id !== id); }),

  addMember: (groupId, name, email) => mutate((d) => {
    const g = group(d, groupId);
    const c = upsertContact(d, name, email);
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, role: 'member', email_opt_out: false });
    log(d, groupId, 'member', id, `Added ${c.name} to the group`);
    return id;
  }),

  addMemberFromContact: (groupId, contactId) => mutate((d) => {
    const g = group(d, groupId);
    const c = d.contacts.find((x) => x.id === contactId);
    if (!c) throw new Error('That friend is not in your list');
    const id = uid();
    g.members.push({ id, group_id: groupId, user_id: c.user_id, contact_id: c.id, name: c.name, email: c.email, role: 'member', email_opt_out: false });
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
    const description = g.expenses.find((e) => e.id === id)!.description;
    g.expenses = g.expenses.filter((e) => e.id !== id);
    log(d, g.id, 'expense', id, `Deleted expense "${description}"`);
  }),

  createSession: (s) => mutate((d) => {
    const id = uid();
    group(d, s.group_id).sessions.push({ ...s, id, status: 'open', created_at: now(), results: [] });
    log(d, s.group_id, 'session', id, `Started a game day${s.location ? ` at ${s.location}` : ''}`);
    return id;
  }),

  updateSession: (id, patch) => mutate((d) => {
    const g = groupOf(d, (x) => x.sessions.some((s) => s.id === id));
    const before = g.sessions.find((s) => s.id === id)!;
    const wasFinal = before.status === 'final';
    Object.assign(before, patch);
    if (patch.status === 'final' && !wasFinal) log(d, g.id, 'session', id, 'Finalized the game day');
    else if (patch.status === 'open' && wasFinal) log(d, g.id, 'session', id, 'Reopened the game day');
    else if (patch.status === undefined) log(d, g.id, 'session', id, 'Updated game day details');
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
    log(d, g.id, 'session', id, `Deleted the game day${location ? ` at ${location}` : ''}`);
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
};
