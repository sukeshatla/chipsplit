import type { AppData, ChangeLogEntry, GameSession, GroupKind, NewExpense, NewSession, NewSettlement, Profile, RummyGame, SessionResult } from '../lib/types';

export interface NewRummyPlayer { name: string; userId: string | null }

export interface AdminOverview {
  total_users: number;
  new_today: number;
  new_this_week: number;
  new_this_month: number;
  active_today: number;
  active_this_week: number;
}
export interface AdminDailyActivity { day: string; new_users: number; active_users: number }
export interface AdminSignup { id: string; display_name: string; email: string; created_at: string; last_seen_at: string | null }

/** Everything the UI can do. Implemented by Supabase (real) and localStorage (demo). */
export interface DataApi {
  mode: 'demo' | 'supabase';
  loadAll(): Promise<AppData>;
  updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'default_currency'>>): Promise<void>;
  /** `blob` is already resized/compressed client-side; this persists it as the new avatar_url. */
  uploadAvatar(blob: Blob): Promise<void>;
  removeAvatar(): Promise<void>;
  createGroup(input: { name: string; kind: GroupKind; currency: string; direct?: boolean }): Promise<string>;
  updateGroup(id: string, patch: { name?: string; kind?: GroupKind; currency?: string }): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  addMember(groupId: string, name: string, email: string | null): Promise<string>;
  addMemberFromContact(groupId: string, contactId: string): Promise<string>;
  /** Only for people without an account -- a signed-up person's name comes from their profile. */
  renameMember(memberId: string, name: string): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  addContact(name: string, email: string | null): Promise<string>;
  deleteContact(contactId: string): Promise<void>;
  /** Admin-only, like every expense write. */
  saveExpense(e: NewExpense, id?: string): Promise<void>;
  /** Admin-only. Soft delete: the expense drops out of balances but can be restored. */
  deleteExpense(id: string): Promise<void>;
  /** Admin-only. Brings a deleted expense back exactly as it was. */
  restoreExpense(id: string): Promise<void>;
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
  /** Admin-only; the server independently verifies the caller before returning anything. */
  loadAdminOverview(): Promise<AdminOverview | null>;
  loadAdminDailyActivity(days?: number): Promise<AdminDailyActivity[]>;
  loadAdminRecentSignups(limit?: number): Promise<AdminSignup[]>;
  /** `groupId: null` lists standalone games (not attached to any group). */
  loadRummyGames(groupId: string | null): Promise<RummyGame[]>;
  loadRummyGame(id: string): Promise<RummyGame | null>;
  createRummyGame(input: { groupId: string | null; name: string; pointLimit: 101 | 151 | 201; buyInCents: number; players: NewRummyPlayer[] }): Promise<string>;
  /** Scorer only, active game: a knocked-out player buys back in at the top active total. */
  rejoinRummyPlayer(playerId: string): Promise<void>;
  /** Scorer only: remember which club game a finished rummy game was posted as. */
  linkRummySession(gameId: string, sessionId: string): Promise<void>;
  /** `scores` must cover exactly the currently-active (non-eliminated) players. */
  addRummyRound(gameId: string, scores: { playerId: string; points: number }[]): Promise<void>;
  /** Only the scorer, at any game status -- may reopen a finished game or finish an active one. */
  updateRummyRound(roundId: string, scores: { playerId: string; points: number }[]): Promise<void>;
  closeRummyGame(gameId: string): Promise<void>;
  deleteRummyGame(gameId: string): Promise<void>;
}
