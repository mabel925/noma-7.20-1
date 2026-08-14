-- Reset the test schema before enabling account-scoped cloud storage.
-- The frontend only receives the publishable key; RLS is the isolation boundary.
begin;

drop table if exists public.spaces cascade;
drop table if exists public.items cascade;

create table public.items (
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

create table public.spaces (
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

create policy "Users can read own items"
on public.items for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own items"
on public.items for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own items"
on public.items for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own items"
on public.items for delete to authenticated
using (auth.uid() = user_id);

create policy "Users can read own spaces"
on public.spaces for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own spaces"
on public.spaces for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own spaces"
on public.spaces for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own spaces"
on public.spaces for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
revoke all on public.items from anon;
revoke all on public.spaces from anon;

create index items_user_id_updated_at_idx
on public.items(user_id, updated_at desc);

create index spaces_user_id_updated_at_idx
on public.spaces(user_id, updated_at desc);

commit;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('items', 'spaces')
  and column_name = 'user_id'
order by table_name;
