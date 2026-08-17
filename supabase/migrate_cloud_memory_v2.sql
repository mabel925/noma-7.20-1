-- Upgrade an existing early Noma schema without deleting account data.
-- Safe to run more than once in the Supabase SQL editor.
begin;

-- Early test tables used bigint identity keys, while the cloud adapter uses
-- stable text keys such as item-... and parent:user-id:room-name.
alter table public.items alter column id drop identity if exists;
alter table public.items alter column id drop default;
alter table public.items alter column id type text using id::text;

alter table public.spaces alter column id drop identity if exists;
alter table public.spaces alter column id drop default;
alter table public.spaces alter column id type text using id::text;

alter table public.items
  add column if not exists category text not null default '其它',
  add column if not exists price text not null default '$0.00',
  add column if not exists date text not null default 'Today',
  add column if not exists emoji text not null default '📝',
  add column if not exists sticker_url text,
  add column if not exists parent_location_name text not null default 'Room',
  add column if not exists sub_location_name text not null default 'Storage spot',
  add column if not exists parent_location_img text,
  add column if not exists sub_location_img text,
  add column if not exists sub_location_highlight jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.spaces
  add column if not exists kind text not null default 'parent',
  add column if not exists parent_name text,
  add column if not exists image_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.spaces'::regclass
      and conname = 'spaces_kind_check'
  ) then
    alter table public.spaces
      add constraint spaces_kind_check check (kind in ('parent', 'sub'));
  end if;
end
$$;

alter table public.items enable row level security;
alter table public.spaces enable row level security;

drop policy if exists "Users can read own items" on public.items;
drop policy if exists "Users can insert own items" on public.items;
drop policy if exists "Users can update own items" on public.items;
drop policy if exists "Users can delete own items" on public.items;

create policy "Users can read own items"
on public.items for select to authenticated
using (auth.uid()::text = user_id::text);

create policy "Users can insert own items"
on public.items for insert to authenticated
with check (auth.uid()::text = user_id::text);

create policy "Users can update own items"
on public.items for update to authenticated
using (auth.uid()::text = user_id::text)
with check (auth.uid()::text = user_id::text);

create policy "Users can delete own items"
on public.items for delete to authenticated
using (auth.uid()::text = user_id::text);

drop policy if exists "Users can read own spaces" on public.spaces;
drop policy if exists "Users can insert own spaces" on public.spaces;
drop policy if exists "Users can update own spaces" on public.spaces;
drop policy if exists "Users can delete own spaces" on public.spaces;

create policy "Users can read own spaces"
on public.spaces for select to authenticated
using (auth.uid()::text = user_id::text);

create policy "Users can insert own spaces"
on public.spaces for insert to authenticated
with check (auth.uid()::text = user_id::text);

create policy "Users can update own spaces"
on public.spaces for update to authenticated
using (auth.uid()::text = user_id::text)
with check (auth.uid()::text = user_id::text);

create policy "Users can delete own spaces"
on public.spaces for delete to authenticated
using (auth.uid()::text = user_id::text);

grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
revoke all on public.items from anon;
revoke all on public.spaces from anon;

create index if not exists items_user_id_updated_at_idx
on public.items(user_id, updated_at desc);

create index if not exists spaces_user_id_updated_at_idx
on public.spaces(user_id, updated_at desc);

notify pgrst, 'reload schema';
commit;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('items', 'spaces')
order by table_name, ordinal_position;
