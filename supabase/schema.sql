-- To-Do List schema for Supabase.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- User accounts are handled by Supabase Auth (auth.users), so there is no users table here.
-- First name, last name and username are stored in each account's user metadata at signup.

-- ---------------------------------------------------------------
-- Tasks (was the `items` table in the PHP app)
-- ---------------------------------------------------------------
create table if not exists public.items (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 1000),
  done        boolean not null default false,
  colour      text not null default 'casual'
              check (colour in ('casual','critical','priority','mediumpriority','important','deadline','notcritical')),
  created_at  timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items (user_id);

-- ---------------------------------------------------------------
-- Subtasks (was the `subitems` table). Now includes the `colour`
-- column the PHP code expected but the old table was missing.
-- ---------------------------------------------------------------
create table if not exists public.subitems (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.items (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subtask     text not null check (char_length(subtask) between 1 and 1000),
  done        boolean not null default false,
  colour      text not null default 'casual'
              check (colour in ('casual','critical','priority','mediumpriority','important','deadline','notcritical')),
  created_at  timestamptz not null default now()
);

create index if not exists subitems_item_id_idx on public.subitems (item_id);
create index if not exists subitems_user_id_idx on public.subitems (user_id);

-- ---------------------------------------------------------------
-- Table access for signed-in users. Some Supabase projects don't grant
-- this automatically. The RLS policies below still limit each user
-- to their own rows. Signed-out visitors (anon) get no access.
-- ---------------------------------------------------------------
grant select, insert, update, delete on public.items    to authenticated;
grant select, insert, update, delete on public.subitems to authenticated;

-- ---------------------------------------------------------------
-- Row Level Security: every user can only read and change their own rows.
-- This replaces the PHP app's (missing) ownership checks.
-- ---------------------------------------------------------------
alter table public.items    enable row level security;
alter table public.subitems enable row level security;

drop policy if exists "Users manage their own items" on public.items;
create policy "Users manage their own items"
  on public.items for all
  to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own subitems" on public.subitems;
create policy "Users manage their own subitems"
  on public.subitems for all
  to authenticated
  using      (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );
