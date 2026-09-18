-- Plush phase 3: memories journal + private storage bucket.
create table if not exists memories (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references homes(id) on delete cascade,
  partner_id  uuid references partners(id) on delete set null,
  kind        text not null check (kind in ('moment','level','streak','eaten','anniversary','joined')),
  key         text,
  caption     text check (char_length(caption) <= 140),
  photo_path  text,
  happened_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (home_id, key)
);
create index if not exists memories_home_happened on memories (home_id, happened_at desc);
alter table memories enable row level security;
drop policy if exists memories_select on memories; create policy memories_select on memories for select using (home_id = my_home_id());

create or replace function add_memory(p_kind text, p_key text default null, p_caption text default null, p_photo_path text default null, p_happened_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members; row memories;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> m.home_id::text then raise exception 'invalid_path'; end if;
  insert into memories (home_id, partner_id, kind, key, caption, photo_path, happened_at)
    values (m.home_id, case when p_kind = 'moment' then m.partner_id else null end, p_kind, p_key, p_caption, p_photo_path, coalesce(p_happened_at, now()))
    on conflict (home_id, key) do nothing returning * into row;
  if row.id is null then select * into row from memories where home_id = m.home_id and key = p_key; end if;
  return to_jsonb(row);
end $$;

create or replace function list_memories(p_before timestamptz default null, p_limit int default 20)
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.happened_at desc), '[]'::jsonb) from (
    select * from memories where home_id = my_home_id() and (p_before is null or happened_at < p_before)
    order by happened_at desc limit least(greatest(p_limit, 1), 50)) x
$$;

create or replace function delete_memory(p_id uuid) returns void language sql security definer set search_path = public as
  $$ delete from memories where id = p_id and home_id = my_home_id() $$;

grant execute on function add_memory(text, text, text, text, timestamptz), list_memories(timestamptz, int), delete_memory(uuid) to authenticated;

-- Storage: private bucket, path <home_id>/<uuid>.jpg
insert into storage.buckets (id, name, public) values ('memories', 'memories', false) on conflict (id) do nothing;
drop policy if exists memories_read on storage.objects;
create policy memories_read on storage.objects for select to authenticated using (bucket_id = 'memories' and split_part(name, '/', 1) = my_home_id()::text);
drop policy if exists memories_write on storage.objects;
create policy memories_write on storage.objects for insert to authenticated with check (bucket_id = 'memories' and split_part(name, '/', 1) = my_home_id()::text);
drop policy if exists memories_delete on storage.objects;
create policy memories_delete on storage.objects for delete to authenticated using (bucket_id = 'memories' and split_part(name, '/', 1) = my_home_id()::text);
