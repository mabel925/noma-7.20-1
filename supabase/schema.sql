-- Run this migration in the Supabase SQL editor before using cloud writes.
-- The frontend only receives the publishable key; RLS is the isolation boundary.

create table if not exists public.items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default '其它',
  price text not null default '$0.00',
  date text not null,
  emoji text not null default '📝',
  sticker_url text,
  parent_location_name text not null,
  sub_location_name text not null,
  parent_location_img text,
  sub_location_img text,
  sub_location_highlight jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('parent', 'sub')),
  parent_name text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items enable row level security;
alter table public.spaces enable row level security;

drop policy if exists "Users can read own items" on public.items;
create policy "Users can read own items" on public.items for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own items" on public.items;
create policy "Users can insert own items" on public.items for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own items" on public.items;
create policy "Users can update own items" on public.items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own items" on public.items;
create policy "Users can delete own items" on public.items for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own spaces" on public.spaces;
create policy "Users can read own spaces" on public.spaces for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own spaces" on public.spaces;
create policy "Users can insert own spaces" on public.spaces for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own spaces" on public.spaces;
create policy "Users can update own spaces" on public.spaces for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own spaces" on public.spaces;
create policy "Users can delete own spaces" on public.spaces for delete using (auth.uid() = user_id);

create index if not exists items_user_id_updated_at_idx on public.items(user_id, updated_at desc);
create index if not exists spaces_user_id_updated_at_idx on public.spaces(user_id, updated_at desc);
