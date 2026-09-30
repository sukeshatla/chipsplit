-- ChipSplit schema: run once in Supabase -> SQL editor (or `supabase db push`).
-- Money is stored as integer cents everywhere.

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  email text not null default '',
  avatar_url text,
  payment_handle text,
  default_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'mixed' check (kind in ('expenses', 'poker', 'mixed')),
  currency text not null default 'USD',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid references auth.users on delete set null,   -- null = guest, linked when they sign up
  name text not null,
  email text,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create index group_members_email_idx on public.group_members (lower(email));

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  description text not null,
  category text not null default 'general',
  amount_cents bigint not null check (amount_cents > 0),
  spent_on date not null default current_date,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_group_idx on public.expenses (group_id);

create table public.expense_payers (
  expense_id uuid not null references public.expenses on delete cascade,
  member_id uuid not null references public.group_members,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, member_id)
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses on delete cascade,
  member_id uuid not null references public.group_members,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, member_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  played_on date not null default current_date,
  location text,
  notes text,
  status text not null default 'open' check (status in ('open', 'final')),
  default_buy_in_cents bigint not null default 5000,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index game_sessions_group_idx on public.game_sessions (group_id);

create table public.session_results (
  session_id uuid not null references public.game_sessions on delete cascade,
  member_id uuid not null references public.group_members,
  buy_in_cents bigint not null default 0 check (buy_in_cents >= 0),
  cash_out_cents bigint not null default 0 check (cash_out_cents >= 0),
  primary key (session_id, member_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  from_member uuid not null references public.group_members,
  to_member uuid not null references public.group_members,
  amount_cents bigint not null check (amount_cents > 0),
  method text,
  note text,
  session_id uuid references public.game_sessions on delete set null,
  settled_on date not null default current_date,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (from_member <> to_member)
);
create index settlements_group_idx on public.settlements (group_id);

-- ---------- Membership helper ----------
create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_shares enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_results enable row level security;
alter table public.settlements enable row level security;

create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

-- Groups are created through create_group() so the creator is added as owner atomically.
create policy "members read groups" on public.groups for select using (public.is_group_member(id));
create policy "members update groups" on public.groups for update using (public.is_group_member(id));
create policy "owners delete groups" on public.groups for delete using (
  exists (select 1 from public.group_members m where m.group_id = id and m.user_id = auth.uid() and m.role = 'owner')
);

-- Members are added through add_member(); anyone in the group can rename or remove members.
create policy "members read members" on public.group_members for select using (public.is_group_member(group_id));
create policy "members update members" on public.group_members for update using (public.is_group_member(group_id));
create policy "members delete members" on public.group_members for delete using (public.is_group_member(group_id));

create policy "members manage expenses" on public.expenses for all
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members manage payers" on public.expense_payers for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));
create policy "members manage shares" on public.expense_shares for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));

create policy "members manage sessions" on public.game_sessions for all
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members manage results" on public.session_results for all
  using (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_group_member(s.group_id)))
  with check (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_group_member(s.group_id)));

create policy "members manage settlements" on public.settlements for all
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- ---------- RPCs ----------
create or replace function public.create_group(p_name text, p_kind text, p_currency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  pname text;
  pemail text;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  select display_name, email into pname, pemail from public.profiles where id = auth.uid();
  insert into public.groups (name, kind, currency, created_by)
    values (trim(p_name), coalesce(p_kind, 'mixed'), coalesce(nullif(p_currency, ''), 'USD'), auth.uid())
    returning id into gid;
  insert into public.group_members (group_id, user_id, name, email, role)
    values (gid, auth.uid(), coalesce(nullif(pname, ''), 'Me'), lower(pemail), 'owner');
  return gid;
end $$;

-- Adds a friend to a group. If someone with that email already has an account,
-- they are linked right away; otherwise they become a guest linked on first sign-in.
create or replace function public.add_member(p_group uuid, p_name text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  mid uuid;
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not public.is_group_member(p_group) then raise exception 'You are not in this group'; end if;
  if em is not null then
    select id into uid from public.profiles where lower(email) = em;
    if uid is not null and exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
      raise exception 'That person is already in this group';
    end if;
  end if;
  insert into public.group_members (group_id, user_id, name, email, role)
    values (p_group, uid, trim(p_name), em, 'member') returning id into mid;
  return mid;
end $$;

grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.add_member(uuid, text, text) to authenticated;

-- ---------- New user: create profile and claim guest invites by email ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  update public.group_members gm set user_id = new.id
  where gm.user_id is null and lower(gm.email) = lower(new.email)
    and not exists (select 1 from public.group_members x where x.group_id = gm.group_id and x.user_id = new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
