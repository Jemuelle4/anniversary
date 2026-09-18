-- Plush phase 2: homes, partners, members, plush_state, plush_events, RPCs.
-- Reference semantics: tests/db/localDb.js (SQLite harness). Keep both in lock-step.
create extension if not exists pgcrypto;

create table if not exists homes (
  id               uuid primary key default gen_random_uuid(),
  invite_code      text not null unique,
  timezone         text not null default 'UTC',
  anniversary_date date,
  created_at       timestamptz not null default now()
);

create table if not exists partners (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references homes(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 16),
  color      text not null check (color in ('rose','amber','mint','sky','lilac','beige')),
  created_at timestamptz not null default now(),
  unique (home_id, name)
);

create table if not exists members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  home_id    uuid not null references homes(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists plush_state (
  home_id    uuid primary key references homes(id) on delete cascade,
  version    bigint not null default 0,
  state      jsonb  not null,
  updated_at timestamptz not null default now()
);

create table if not exists plush_events (
  id          uuid primary key,
  home_id     uuid not null references homes(id) on delete cascade,
  partner_id  uuid not null references partners(id),
  type        text not null,
  version     bigint not null,
  client_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  payload     jsonb not null default '{}'::jsonb,
  state_after jsonb not null,
  unique (home_id, version)
);
create index if not exists plush_events_home_created on plush_events (home_id, created_at desc);

-- Two partners per home.
create or replace function partners_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from partners where home_id = new.home_id) >= 2 then
    raise exception 'home_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists partners_limit on partners;
create trigger partners_limit before insert on partners for each row execute function partners_limit();

-- Realtime on events.
do $$ begin
  alter publication supabase_realtime add table plush_events;
exception when duplicate_object then null; end $$;

-- ---------- RLS ----------
alter table homes enable row level security;
alter table partners enable row level security;
alter table members enable row level security;
alter table plush_state enable row level security;
alter table plush_events enable row level security;

create or replace function my_home_id() returns uuid language sql stable security definer set search_path = public as
  $$ select home_id from members where user_id = auth.uid() $$;

drop policy if exists homes_select on homes;        create policy homes_select on homes for select using (id = my_home_id());
drop policy if exists partners_select on partners;  create policy partners_select on partners for select using (home_id = my_home_id());
drop policy if exists members_select on members;    create policy members_select on members for select using (user_id = auth.uid() or home_id = my_home_id());
drop policy if exists state_select on plush_state;  create policy state_select on plush_state for select using (home_id = my_home_id());
drop policy if exists events_select on plush_events; create policy events_select on plush_events for select using (home_id = my_home_id());
-- No insert/update/delete policies: all writes go through the RPCs below.

-- ---------- helpers ----------
create or replace function is_valid_state(s jsonb) returns boolean language plpgsql immutable as $$
declare n text; v numeric;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return false; end if;
  if (s->>'version')::int is distinct from 3 then return false; end if;
  if jsonb_typeof(s->'needs') <> 'object' then return false; end if;
  foreach n in array array['fullness','fun','love','energy'] loop
    if jsonb_typeof(s->'needs'->n) <> 'number' then return false; end if;
    v := (s->'needs'->>n)::numeric;
    if v < 0 or v > 100 then return false; end if;
  end loop;
  if jsonb_typeof(s->'asleep') <> 'boolean' then return false; end if;
  if jsonb_typeof(s->'bites'->'count') <> 'number' or (s->'bites'->>'count')::int not between 0 and 20 then return false; end if;
  if jsonb_typeof(s->'progress'->'level') <> 'number' or (s->'progress'->>'level')::int not between 1 and 10 then return false; end if;
  return true;
exception when others then return false;
end $$;

create or replace function make_invite_code() returns text language plpgsql volatile as $$
declare alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; code text := 'PLUSH-'; i int;
begin
  for i in 1..4 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
  return code;
end $$;

-- Advance state + record an event (internal).
create or replace function plush_advance(p_home uuid, p_partner uuid, p_type text, p_client_at timestamptz, p_payload jsonb, p_new_state jsonb, p_event_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v bigint; ev plush_events;
begin
  update plush_state set state = p_new_state, version = version + 1, updated_at = now() where home_id = p_home returning version into v;
  insert into plush_events (id, home_id, partner_id, type, version, client_at, payload, state_after)
    values (p_event_id, p_home, p_partner, p_type, p_client_at, coalesce(p_payload, '{}'::jsonb), p_new_state) returning * into ev;
  return jsonb_build_object('state', p_new_state, 'version', v, 'event', to_jsonb(ev));
end $$;

-- ---------- RPCs ----------
create or replace function server_now() returns timestamptz language sql stable as $$ select now() $$;

create or replace function create_home(p_name text, p_color text, p_initial_state jsonb, p_timezone text default 'UTC', p_brought_local boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h uuid; p uuid; code text; r jsonb; attempts int := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from members where user_id = uid) then raise exception 'already_member'; end if;
  if not is_valid_state(p_initial_state) then raise exception 'invalid'; end if;
  loop
    code := make_invite_code();
    begin
      insert into homes (invite_code, timezone) values (code, coalesce(nullif(p_timezone, ''), 'UTC')) returning id into h; exit;
    exception when unique_violation then attempts := attempts + 1; if attempts > 5 then raise; end if; end;
  end loop;
  insert into partners (home_id, name, color) values (h, p_name, p_color) returning id into p;
  insert into members (user_id, home_id, partner_id) values (uid, h, p);
  insert into plush_state (home_id, version, state) values (h, 0, p_initial_state);
  r := plush_advance(h, p, 'join', now(), jsonb_build_object('name', p_name, 'color', p_color), p_initial_state);
  if p_brought_local then r := plush_advance(h, p, 'migrate', now(), '{"from":"local"}'::jsonb, p_initial_state); end if;
  return jsonb_build_object('home_id', h, 'invite_code', code, 'partner_id', p, 'state', r->'state', 'version', r->'version');
end $$;

create or replace function join_home(p_code text, p_name text, p_color text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m members; hm homes; p uuid; st plush_state; r jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into m from members where user_id = uid;
  if found then
    select * into hm from homes where id = m.home_id; select * into st from plush_state where home_id = m.home_id;
    return jsonb_build_object('home_id', hm.id, 'invite_code', hm.invite_code, 'partner_id', m.partner_id, 'state', st.state, 'version', st.version, 'existing', true);
  end if;
  select * into hm from homes where upper(invite_code) = upper(p_code);
  if not found then raise exception 'not_found'; end if;
  select id into p from partners where home_id = hm.id and name = p_name;
  if p is null then
    insert into partners (home_id, name, color) values (hm.id, p_name, p_color) returning id into p;  -- trigger raises home_full
  end if;
  insert into members (user_id, home_id, partner_id) values (uid, hm.id, p);
  select * into st from plush_state where home_id = hm.id for update;
  r := plush_advance(hm.id, p, 'join', now(), jsonb_build_object('name', p_name, 'color', p_color), st.state);
  return jsonb_build_object('home_id', hm.id, 'invite_code', hm.invite_code, 'partner_id', p, 'state', r->'state', 'version', r->'version');
end $$;

create or replace function commit_action(p_event_id uuid, p_type text, p_client_at timestamptz, p_expected_version bigint, p_new_state jsonb, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members; st plush_state; ev plush_events; r jsonb;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  select * into st from plush_state where home_id = m.home_id for update;
  if abs(extract(epoch from (now() - p_client_at))) > 300 then
    return jsonb_build_object('ok', false, 'code', 'clock', 'state', st.state, 'version', st.version);
  end if;
  select * into ev from plush_events where id = p_event_id;
  if found then return jsonb_build_object('ok', true, 'code', 'duplicate', 'state', st.state, 'version', st.version, 'event', to_jsonb(ev)); end if;
  if st.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'version', 'state', st.state, 'version', st.version);
  end if;
  if not is_valid_state(p_new_state) then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'state', st.state, 'version', st.version);
  end if;
  r := plush_advance(m.home_id, m.partner_id, p_type, p_client_at, p_payload, p_new_state, p_event_id);
  return jsonb_build_object('ok', true) || r;
end $$;

create or replace function reset_home(p_new_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members; r jsonb;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  if not is_valid_state(p_new_state) then raise exception 'invalid'; end if;
  perform 1 from plush_state where home_id = m.home_id for update;
  r := plush_advance(m.home_id, m.partner_id, 'reset', now(), '{}'::jsonb, p_new_state);
  return jsonb_build_object('state', r->'state', 'version', r->'version');
end $$;

create or replace function leave_home() returns void language sql security definer set search_path = public as
  $$ delete from members where user_id = auth.uid() $$;

create or replace function home_snapshot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members; hm homes; st plush_state;
begin
  select * into m from members where user_id = auth.uid();
  if not found then return null; end if;
  select * into hm from homes where id = m.home_id;
  select * into st from plush_state where home_id = m.home_id;
  return jsonb_build_object(
    'home', jsonb_build_object('id', hm.id, 'invite_code', hm.invite_code, 'timezone', hm.timezone, 'anniversary_date', hm.anniversary_date),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color) order by created_at) from partners where home_id = m.home_id), '[]'::jsonb),
    'me', jsonb_build_object('user_id', m.user_id, 'partner_id', m.partner_id),
    'state', st.state, 'version', st.version,
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.version desc) from (select * from plush_events where home_id = m.home_id order by version desc limit 30) e), '[]'::jsonb)
  );
end $$;

create or replace function update_home(p_timezone text default null, p_anniversary_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members; st plush_state;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  update homes set timezone = coalesce(nullif(p_timezone, ''), timezone), anniversary_date = p_anniversary_date where id = m.home_id;
  select * into st from plush_state where home_id = m.home_id for update;
  perform plush_advance(m.home_id, m.partner_id, 'settings', now(), jsonb_build_object('timezone', p_timezone, 'anniversary_date', p_anniversary_date), st.state);
  return home_snapshot();
end $$;

create or replace function update_partner(p_name text default null, p_color text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  update partners set name = coalesce(nullif(p_name, ''), name), color = coalesce(p_color, color) where id = m.partner_id;
  return home_snapshot();
end $$;

grant execute on function server_now() to anon, authenticated;
grant execute on function create_home(text, text, jsonb, text, boolean), join_home(text, text, text), commit_action(uuid, text, timestamptz, bigint, jsonb, jsonb), reset_home(jsonb), leave_home(), home_snapshot(), update_home(text, date), update_partner(text, text) to authenticated;
revoke execute on function plush_advance(uuid, uuid, text, timestamptz, jsonb, jsonb, uuid) from public, anon, authenticated;
