# Phase 2 — Shared sync (two people, one Plush)

Status: **done** (spec). Implementation: not started. Requires phase 1 complete.

## 1. Goal

Both partners, on any of their devices, see and affect the same Plush. Actions taken
while the other is away show up in an activity feed with the actor's name. When both are
on at once, actions animate on both screens within about a second. The app keeps working
offline and reconciles when back online.

## 2. Stack decisions

| Concern | Decision | Why |
|---|---|---|
| Backend | Supabase: Postgres, Row Level Security, Realtime (`postgres_changes` + Presence), anonymous auth | Hosted, free tier is plenty for two people, works from a static site with one CDN script. The session that wrote these specs had Supabase tooling available; build agents can apply migrations with it or with the SQL editor. |
| Client library | `@supabase/supabase-js` v2 via ESM CDN: `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` | No package manager. Pin the major only; record the resolved minor in `CLAUDE.md` when built. |
| Identity | Anonymous auth per device; devices map to one of two **partners** in a **home** | No emails or passwords. The invite code is the only secret. |
| Where actions are applied | **On the client**, with the phase 1 `applyAction`, then committed with an atomic compare-and-swap RPC | Keeps one implementation of the game rules in JS. Rejected: porting rules to PL/pgSQL (duplicate logic) and Edge Functions (deploy tooling, cold starts, bundling of `src/game` uncertain). Between two trusting partners, server validation of arithmetic buys nothing; server serialisation of writes buys everything. |
| Time | Client clock corrected by a server offset; RPC rejects skew > 5 min | Decay is computed from timestamps, so both devices must agree on "now". |

Principle 4 in `product-brief.md` is refined accordingly: the `plush_state` row is the
single source of truth and every write goes through one RPC that checks the row version,
so two devices can never overwrite each other.

## 3. Concepts

- **Home**: one shared Plush. Has an invite code. Exactly one `plush_state` row.
- **Partner**: a person in a home (max 2). Has `name` (1–16 chars) and `color` (one of six
  swatches). Displayed in the feed and on `lastAction`.
- **Member**: an auth user (a device/browser) linked to a partner. A partner can have many
  members (phone + laptop).
- **Event**: an applied action, immutable, with the full `state_after` snapshot. Refused
  actions are never recorded.

## 4. Database schema (migration `0001_plush_homes.sql`)

```sql
create extension if not exists pgcrypto;

create table homes (
  id          uuid primary key default gen_random_uuid(),
  invite_code text not null unique,            -- e.g. PLUSH-4K7Q, generated server-side
  created_at  timestamptz not null default now()
);

create table partners (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references homes(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 16),
  color      text not null check (color in ('rose','amber','mint','sky','lilac','beige')),
  created_at timestamptz not null default now(),
  unique (home_id, name)
);

create table members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  home_id    uuid not null references homes(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table plush_state (
  home_id    uuid primary key references homes(id) on delete cascade,
  version    bigint not null default 0,
  state      jsonb  not null,                  -- the phase 1 state object, schema version 2
  updated_at timestamptz not null default now()
);

create table plush_events (
  id          uuid primary key,                -- client generated, idempotency key
  home_id     uuid not null references homes(id) on delete cascade,
  partner_id  uuid not null references partners(id),
  type        text not null,                   -- feed|cuddle|play|nibble|boom|sleep|wake|join|reset|migrate
  version     bigint not null,                 -- plush_state.version after this event
  client_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  payload     jsonb not null default '{}',     -- e.g. {"seed": 123} for a respawn, {"name": "Sam"} for join
  state_after jsonb not null,
  unique (home_id, version)
);
create index on plush_events (home_id, created_at desc);

-- Limit to two partners per home (trigger; a CHECK cannot count rows).
create function partners_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from partners where home_id = new.home_id) >= 2 then
    raise exception 'home_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger partners_limit before insert on partners for each row execute function partners_limit();

alter publication supabase_realtime add table plush_events;
```

### RLS

All four tables have RLS enabled. Members can read their own home's rows; **no direct
writes** from clients at all. Every write is a `security definer` RPC below.

```sql
create function my_home_id() returns uuid language sql stable security definer as
  $$ select home_id from members where user_id = auth.uid() $$;

-- select policies (one per table): using (home_id = my_home_id())
-- members: using (user_id = auth.uid() or home_id = my_home_id())
-- no insert/update/delete policies => denied by default
```

## 5. RPCs (all `security definer`, `set search_path = public`)

| RPC | Args | Returns | Behaviour |
|---|---|---|---|
| `server_now()` | — | `timestamptz` | For clock offset. Callable by anon. |
| `create_home(p_name, p_color, p_initial_state jsonb)` | | `{ home_id, invite_code, partner_id, state, version }` | Caller must not already be a member. Creates home with a fresh code, partner, member, `plush_state` (from `p_initial_state` if it passes `is_valid_state`, else the default initial state generated client-side and passed in), and a `join` event (version 1) plus a `migrate` event if a state was brought. |
| `join_home(p_code, p_name, p_color)` | | same shape | Looks up home by code (case-insensitive). If a partner named `p_name` exists, links this user to it (second device). Else creates a partner (trigger enforces max 2; error `home_full` surfaces as a toast). Inserts a `join` event. Caller must not already be a member; if they are, returns their existing home (idempotent). |
| `commit_action(p_event_id uuid, p_type text, p_client_at timestamptz, p_expected_version bigint, p_new_state jsonb, p_payload jsonb)` | | `{ ok, code?, state, version, event? }` | The core write. See 5.1. |
| `reset_home()` | — | `{ state, version }` | Replaces state with a fresh initial state (passed from client as `p_new_state` variant: `reset_home(p_new_state)`), records a `reset` event. |
| `leave_home()` | — | void | Deletes the caller's `members` row only. Not exposed in UI in phase 2; exists for support. |
| `home_snapshot()` | — | `{ home, partners[], me, state, version, events[] (last 30) }` | One round trip on boot. |

### 5.1 `commit_action` semantics

```
lock plush_state row for update
if abs(extract(epoch from now() - p_client_at)) > 300 -> return { ok:false, code:'clock' }
if exists plush_events where id = p_event_id      -> return { ok:true, code:'duplicate', state, version } (idempotent)
if version <> p_expected_version                  -> return { ok:false, code:'version', state, version }
if not is_valid_state(p_new_state)                -> return { ok:false, code:'invalid' }
update plush_state set state = p_new_state, version = version + 1, updated_at = now()
insert plush_events (id, home_id, partner_id, type, version, client_at, payload, state_after)
return { ok:true, state, version, event }
```

`is_valid_state(jsonb)` checks: `version = 2`, four needs present and each is a number in
0–100, `bites.count` in 0–20, `asleep` boolean. Nothing more; the client is trusted for
arithmetic.

## 6. Client state schema (v2)

Phase 1's v1 state plus:

```json
{
  "version": 2,
  "lastAction": { "type": "feed", "at": 1758200000000, "by": "<partner uuid>" }
}
```

`migrate(raw)` maps v1 → v2 by setting `version = 2` and `lastAction.by = null`.
Everything under `needs`, `bites`, `cooldowns`, `counters` is unchanged. The server row
stores exactly this object.

## 7. Client architecture additions

```
config.js                       export const SUPABASE_URL, SUPABASE_ANON_KEY (public by design)
src/store/supabaseStore.js      Store implementation: load/save/clear + subscribe + commit
src/sync/client.js              createClient singleton, ensureAnonSession()
src/sync/clock.js               offset from server_now(); now() = Date.now() + offset
src/sync/outbox.js              pure queue reducer + flush loop (tested)
src/sync/realtime.js            channel subscription, presence, event fan-out
src/ui/pairing.js               create/join sheet, invite code share
src/ui/feed.js                  activity feed sheet
src/ui/presence.js              "Sam is here" pill
src/pet.js                      unchanged loop; store chosen by config + session
```

`app.js` chooses the store: if `config.js` has a URL and the device has (or can get) an
anonymous session → `SupabaseStore`; otherwise `LocalStore` (phase 1 behaviour, used for
local development without a project). A `?local=1` query flag forces `LocalStore`.

### 7.1 Store interface (v2)

```js
/**
 * @typedef {object} Store
 * @prop {() => Promise<Snapshot|null>} load          // full snapshot (state, version, partners, me, events)
 * @prop {(event: PendingEvent) => Promise<CommitResult>} commit   // replaces save() for actions
 * @prop {() => Promise<void>} clear                  // reset (LocalStore) / reset_home (Supabase)
 * @prop {(cb: (msg: StoreMessage) => void) => () => void} subscribe  // remote events, presence, connection
 */
// PendingEvent = { id, type, clientAt, expectedVersion, newState, payload }
// CommitResult = { ok, code?, state, version, event? }
// StoreMessage = { kind: 'event', event } | { kind: 'presence', partnersOnline: string[] } | { kind: 'connection', online: boolean }
```

`LocalStore.commit` applies trivially (version increments locally) so `pet.js` has one
code path. `LocalStore.subscribe` never emits.

### 7.2 Dispatch with optimistic apply and CAS

```
dispatch(type):
  now = clock.now()
  { state: next, effects } = applyAction(state, type, now)
  if refused: toast; maybe wake; return
  event = { id: uuidv4(), type, clientAt: now, expectedVersion: version, newState: next,
            payload: effects.includes('bites:respawn') ? { seed: next.bites.seed } : {} }
  state = next; version = version + 1 (optimistic)
  render(state); stage.play(effects)
  outbox.enqueue(event); outbox.flush()
```

`outbox.flush()` sends events in order through `store.commit`:

- `ok` → mark done; adopt returned `state`/`version` (they equal ours unless rebased).
- `code:'duplicate'` → same as ok.
- `code:'version'` → **rebase**: set `state`/`version` from the response, then re-derive
  every remaining outbox event by re-running `applyAction(state, type, clock.now())` on
  top; if now refused, drop it and toast "Your <action> didn't go through: <reason>".
  Update the events' `expectedVersion`/`newState` and retry. Cap at 5 rebases per
  event, then drop with a toast.
- `code:'clock'` → refresh offset from `server_now()`, rebuild `clientAt`, retry once.
- `code:'invalid'` → drop, `console.error`, toast "Something went wrong; reloaded Plush"
  and reload the snapshot.
- Network error → keep in outbox, set `connection.online=false`, retry with backoff
  1 s, 2 s, 4 s, … capped at 30 s, and on `online` window event.

The outbox is persisted in `localStorage` key `plush.v2.outbox` so a closed tab does not
lose actions. The optimistic state is also persisted under `plush.v2.cache` for instant
paint on next open; it is replaced by the server snapshot on load.

### 7.3 Receiving remote events

Realtime channel `home:<home_id>`:

- `postgres_changes` INSERT on `plush_events` with filter `home_id=eq.<id>`.
  On each row: ignore if `partner_id === me.partnerId` **and** the id is in our
  done/outbox set (our own echo). Otherwise, if `row.version === version + 1`: adopt
  `state_after`, `version = row.version`, render, `stage.play(effectsFor(row))`, prepend to
  feed. If `row.version > version + 1` (gap): call `home_snapshot()` and re-render
  without animations. If `row.version <= version`: ignore (stale).
- Any outbox events pending when a remote event arrives are rebased as in 7.2 before the
  next flush.
- `effectsFor(row)` recomputes the effect tags from `type` and `payload` (`nibble` with
  `payload.seed` → `bites:respawn`), so the partner sees the same animation, including
  the respawn.

Presence: the channel tracks `{ partnerId, name }`; `presence.js` shows "<name> is here"
when the other partner has ≥1 tracked device. Realtime `SUBSCRIBED`/`CLOSED` toggles the
connection pill.

Fallback poll: if the channel is not `SUBSCRIBED` within 5 s, or on any visibilitychange to
visible, call `home_snapshot()` once. This covers missed events.

## 8. Pairing flow (`ui/pairing.js`)

Triggered on the Plush page when the device's user is not a member of any home.

1. **Choose**: sheet with two buttons: "Start a new Plush" / "I have a code".
2. **Start**: name field (autofocus), six colour swatches, "Bring my current Plush" toggle
   (shown only if a phase 1 `plush.v1.state` exists in localStorage; default on). Submit →
   `create_home`. On success show the invite code big, with "Share" (Web Share API with
   text "Come look after Plush with me: <url>?join=<code>") and "Copy". Continue → Plush
   page.
3. **Join**: code field (uppercase, auto-inserts the dash), name, colour. Submit →
   `join_home`. Errors: `not_found` → "That code doesn't match a home", `home_full` →
   "This home already has two people. If that's you, use the same name you used before."
4. Deep link: if `?join=CODE` is in the URL, skip to step 3 with the code filled.
5. Second device of an existing partner: step 3 with the same name links to that partner.
6. After pairing, the local phase 1 state (if any) is renamed to `plush.v1.state.migrated`
   and never read again.

Invite codes: `PLUSH-` + 4 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L),
generated in `create_home` with a retry on unique violation. Codes are never rotated in
phase 2.

## 9. UI additions

- **Mood line** gains the actor: `Happy · Sam fed Plush 2h ago`. `lastAction.by` → partner
  name; null → "someone".
- **Feed sheet** (menu → "Activity"): last 30 events, newest first, one line each:
  `<swatch> <name> <verb phrase> · <relative time>`. Verb phrases: fed Plush, cuddled
  Plush, played with Plush, nibbled Plush, boomed Plush, tucked Plush in, woke Plush up,
  joined, reset Plush, brought their Plush over. Respawn nibbles say "ate Plush whole".
- **Presence pill** top-right of the HUD: partner's swatch + "here" when online; hidden
  otherwise.
- **Connection pill**: "offline · 2 waiting" shown while `online=false` or outbox non-empty.
- **Menu** adds: Activity, Invite code (shows code + share again), Playground, Reset Plush
  (confirm; records `reset` event visible to the partner).
- Remote actions animate on the stage exactly like local ones, but the dock busy lock is
  not engaged, and a small "Sam" chip appears next to the plush for 1.5 s.

## 10. Tests

`node --test`:

- `outbox.test.js` (pure reducer): enqueue/flush order; duplicate → done; version
  conflict rebases remaining events with fresh `expectedVersion`; refused-after-rebase
  events are dropped with a reason; rebase cap; persistence round trip.
- `migrate.test.js`: v1 → v2 adds `by: null`; v2 passes through.
- `effectsFor.test.js`: every event type maps to the same effect tags `applyAction`
  produces, including respawn from payload.
- `inviteCode.test.js`: format and alphabet (client-side validator used by the join
  form).

Manual two-browser checklist (build agent runs before marking done):

- [ ] Create home in browser A, join in browser B with code; both see the same needs.
- [ ] Feed in A → B animates within ~1 s and feed shows "A fed Plush".
- [ ] Nibble 20× in A → B shows the respawn with identical bite marks before it.
- [ ] Put B offline (devtools), cuddle twice, go online → both commits land, A sees both.
- [ ] Simultaneous play in A and B → one gets version conflict, rebases, both end at the
      same state and version; no duplicate events.
- [ ] Sleep in A, wait > 30 min (or edit `sleepStartedAt` via a `reset`-free admin SQL
      update), open B → auto-wake happens in whichever client applies decay first and the
      other adopts it.
- [ ] `?local=1` still runs the phase 1 local store.

SQL checks (SQL editor or Supabase tooling): RLS blocks a second anonymous user from
selecting another home's rows; direct `insert into plush_events` from the anon role fails;
`partners_limit` raises on a third partner.

## 11. Configuration and secrets

- `config.js` is committed with the project URL and the **anon (publishable) key**. This
  key is designed to be public; RLS and the RPC-only write surface are the security
  boundary.
- Never commit the service role key. Migrations are applied by a person or by a build
  agent with Supabase tooling, not by the app.
- Migrations live in `supabase/migrations/` as plain `.sql` files, numbered, and are the
  source of truth for the schema. Applying them is documented in `build-agent-guide.md`.

## 12. Assumptions

- Two partners, each possibly with several devices; a partner is identified by name within
  the home, which is enough for two people who share the invite code.
- Losing the anonymous session (cleared site data) means re-joining with the code and the
  same name. That is acceptable; nothing is lost because state lives server-side.
- Supabase free tier: Realtime and DB usage for two people is far below limits; the
  project pausing after a week of inactivity is the one operational risk and is handled in
  phase 4 (keep-alive ping and a clear "Plush is napping on the server" error state).
