/** 'club' = a standing group of people you play games with repeatedly; also holds expenses. */
export type GroupKind = 'expenses' | 'club';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  default_currency: string;
  notifications_seen_at: string; // entries after this are "unread" in the notifications bell
  /** false only for a brand-new account that hasn't confirmed its name yet (welcome screen). */
  name_confirmed?: boolean;
}

export interface Member {
  id: string;
  group_id: string;
  user_id: string | null; // null = guest who hasn't signed up yet
  contact_id: string | null; // links back to the adder's Contact, if added from (or as) a friend
  name: string;
  email: string | null;
  email_opt_out: boolean; // excluded from this group's "email summary" mailto
  is_admin: boolean; // can change group settings, delete the group, or delete an expense
  avatar_url?: string | null; // filled in at load time from the linked profile, if any; not stored here
}

/** An entry in the signed-in user's own friends list, independent of any group. */
export interface Contact {
  id: string;
  owner_id: string;
  user_id: string | null; // set once their signed-up email matches
  name: string;
  email: string | null;
  created_at: string;
  avatar_url?: string | null; // filled in at load time from the linked profile, if any; not stored here
}

export interface Split {
  member_id: string;
  amount_cents: number;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  category: string;
  amount_cents: number;
  spent_on: string; // YYYY-MM-DD
  created_by: string | null;
  created_at: string;
  payers: Split[];
  shares: Split[];
  deleted_at?: string | null; // set only on entries in Group.deleted_expenses
}

export interface SessionResult {
  member_id: string;
  buy_in_cents: number;
  cash_out_cents: number;
  /** Chips handed back to the bank mid-game (any number of times). Counts like cash already
   *  taken out: net = cash_out + returned - buy_in. Optional so older rows/callers read as 0. */
  returned_cents?: number;
}

export interface GameSession {
  id: string;
  group_id: string;
  played_on: string;
  location: string | null;
  notes: string | null;
  status: 'open' | 'final';
  default_buy_in_cents: number;
  /** The host: whoever started the game. Only they can change or delete it (null on old games = group admins). */
  created_by?: string | null;
  created_at: string;
  results: SessionResult[];
}

export interface Settlement {
  id: string;
  group_id: string;
  from_member: string;
  to_member: string;
  amount_cents: number;
  method: string | null;
  note: string | null;
  session_id: string | null;
  settled_on: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  currency: string;
  /** A friend-only expense group (made from Quick add or a friend's page): hidden from Groups
   *  lists and shown under Friends instead. Works like any other group underneath. */
  is_direct?: boolean;
  created_by: string | null;
  created_at: string;
  members: Member[];
  expenses: Expense[];
  /** Soft-deleted expenses: left out of every balance, kept so History can restore them. */
  deleted_expenses?: Expense[];
  sessions: GameSession[];
  settlements: Settlement[];
}

export interface AppData {
  me: Profile;
  groups: Group[];
  contacts: Contact[];
  /** Friend keys (src/lib/ledger.ts friendKey) you removed from your Friends list. */
  hidden_friends?: string[];
}

/** One line of a group's lightweight activity log (src/lib/ledger.ts renders these). */
export interface ChangeLogEntry {
  id: string;
  group_id: string;
  actor_id: string | null;
  entity_type: 'member' | 'expense' | 'session' | 'settlement' | 'group';
  entity_id: string | null;
  summary: string;
  created_at: string;
}

export type NewExpense = Omit<Expense, 'id' | 'created_at' | 'created_by' | 'deleted_at'>;
export type NewSettlement = Omit<Settlement, 'id' | 'created_at'>;
export interface NewSession {
  group_id: string;
  played_on: string;
  location: string | null;
  notes: string | null;
  default_buy_in_cents: number;
}

export interface RummyPlayer {
  id: string;
  rummy_game_id: string;
  user_id: string | null;
  name: string;
  rejoins: number; // times they bought back in after being knocked out
  score_offset: number; // added to their round points; a rejoin resets them to the top active total
  avatar_url?: string | null; // filled in at load time, same as Member/Contact
}

export interface RummyRound {
  id: string;
  round_no: number;
  created_at: string;
  scores: { player_id: string; points: number }[];
}

export interface RummyGame {
  id: string;
  group_id: string | null;
  name: string | null;
  point_limit: 101 | 151 | 201;
  buy_in_cents: number; // each player's stake; 0 = just keeping score
  session_id: string | null; // the club game this result was posted as, once posted
  status: 'active' | 'finished';
  scorer_id: string;
  winner_player_id: string | null;
  created_at: string;
  finished_at: string | null;
  players: RummyPlayer[];
  rounds: RummyRound[];
}
