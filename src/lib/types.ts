export type GroupKind = 'expenses' | 'poker' | 'mixed';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  payment_handle: string | null;
  default_currency: string;
}

export interface Member {
  id: string;
  group_id: string;
  user_id: string | null; // null = guest who hasn't signed up yet
  name: string;
  email: string | null;
  role: 'owner' | 'member';
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
}

export interface SessionResult {
  member_id: string;
  buy_in_cents: number;
  cash_out_cents: number;
}

export interface GameSession {
  id: string;
  group_id: string;
  played_on: string;
  location: string | null;
  notes: string | null;
  status: 'open' | 'final';
  default_buy_in_cents: number;
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
  created_by: string | null;
  created_at: string;
  members: Member[];
  expenses: Expense[];
  sessions: GameSession[];
  settlements: Settlement[];
}

export interface AppData {
  me: Profile;
  groups: Group[];
}

export type NewExpense = Omit<Expense, 'id' | 'created_at' | 'created_by'>;
export type NewSettlement = Omit<Settlement, 'id' | 'created_at'>;
export interface NewSession {
  group_id: string;
  played_on: string;
  location: string | null;
  notes: string | null;
  default_buy_in_cents: number;
}
