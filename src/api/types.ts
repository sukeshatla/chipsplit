import type { AppData, ChangeLogEntry, GameSession, GroupKind, NewExpense, NewSession, NewSettlement, Profile, SessionResult } from '../lib/types';

/** Everything the UI can do. Implemented by Supabase (real) and localStorage (demo). */
export interface DataApi {
  mode: 'demo' | 'supabase';
  loadAll(): Promise<AppData>;
  updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'default_currency'>>): Promise<void>;
  createGroup(input: { name: string; kind: GroupKind; currency: string }): Promise<string>;
  updateGroup(id: string, patch: { name?: string; kind?: GroupKind; currency?: string }): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  addMember(groupId: string, name: string, email: string | null): Promise<string>;
  addMemberFromContact(groupId: string, contactId: string): Promise<string>;
  renameMember(memberId: string, name: string): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  addContact(name: string, email: string | null): Promise<string>;
  renameContact(contactId: string, name: string): Promise<void>;
  deleteContact(contactId: string): Promise<void>;
  saveExpense(e: NewExpense, id?: string): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  createSession(s: NewSession): Promise<string>;
  updateSession(id: string, patch: Partial<Pick<GameSession, 'played_on' | 'location' | 'notes' | 'status' | 'default_buy_in_cents'>>): Promise<void>;
  saveSessionResults(id: string, results: SessionResult[]): Promise<void>;
  deleteSession(id: string): Promise<void>;
  addSettlement(s: NewSettlement): Promise<void>;
  deleteSettlement(id: string): Promise<void>;
  loadHistory(groupId: string): Promise<ChangeLogEntry[]>;
  setEmailOptOut(memberId: string, optOut: boolean): Promise<void>;
  setGroupAdmin(memberId: string, isAdmin: boolean): Promise<void>;
  loadNotifications(): Promise<ChangeLogEntry[]>;
  markNotificationsSeen(): Promise<void>;
}
