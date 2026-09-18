-- Plush phase 4: web push subscriptions (direct table access for own rows) + nudge schedule note.
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  home_id      uuid not null references homes(id) on delete cascade,
  partner_id   uuid not null references partners(id) on delete cascade,
  endpoint     text not null unique,
  keys         jsonb not null,
  quiet_start  smallint not null default 22,
  quiet_end    smallint not null default 8,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own_select on push_subscriptions; create policy push_own_select on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_own_insert on push_subscriptions; create policy push_own_insert on push_subscriptions for insert with check (user_id = auth.uid() and home_id = my_home_id());
drop policy if exists push_own_update on push_subscriptions; create policy push_own_update on push_subscriptions for update using (user_id = auth.uid());
drop policy if exists push_own_delete on push_subscriptions; create policy push_own_delete on push_subscriptions for delete using (user_id = auth.uid());

-- Scheduling the `nudge` Edge Function hourly (choose one):
--   a) Dashboard → Edge Functions → nudge → Schedule: "0 * * * *"
--   b) pg_cron + pg_net (replace <ref> and <service-role-key>, stored via vault in production):
--      select cron.schedule('plush-nudge', '0 * * * *', $$
--        select net.http_post('https://<ref>.supabase.co/functions/v1/nudge',
--          headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb, body := '{}'::jsonb) $$);
