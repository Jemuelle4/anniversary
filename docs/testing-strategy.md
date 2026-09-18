# Testing strategy

Status: **done**. Defines three tiers of tests, what runs today without Supabase, and
exactly which tests are deferred until a Supabase project and connector are available.

## 1. Tiers

| Tier | Runs where | Needs | Command |
|---|---|---|---|
| A. Pure logic | Node, any machine | nothing | `npm test` (`node --test "tests/**/*.test.js"`) |
| B. Local DB harness | Node ≥ 22.13 (`node:sqlite` built in) | nothing | `npm run test:db` |
| B2. Browser end-to-end | headless Chromium (DevTools protocol, no Playwright) | Chromium at `/opt/pw-browsers/chromium` or `$CHROMIUM` | `npm run e2e` |
| C. Supabase integration | a Supabase project (or `supabase start` locally) | project URL, anon key, service role key for setup, migrations applied | see section 5; **deferred** |

Tier A is everything under `src/game`, `src/store/localStore.js`, and `src/sync/outbox.js`
(listed per phase in the phase docs). Tier B is what this session built. Tier C is what a
later session implements once the connector is available.

## 2. Tier B: the SQLite harness (built, passing)

Files:

- `tests/db/schema.sql` — SQLite mirror of `supabase/migrations/0001_plush_homes.sql`
  with the same tables, columns, constraints, and the two-partner trigger.
- `tests/db/localDb.js` — JS reference implementation of every phase 2 RPC
  (`server_now`, `create_home`, `join_home`, `commit_action`, `reset_home`, `leave_home`,
  `home_snapshot`) plus `isValidState` and an RLS emulation (`selectAsUser`). Each RPC
  runs in one `BEGIN IMMEDIATE` transaction, which serialises writes the way Postgres's
  `select … for update` does.
- `tests/db/fixtures.js` — minimal valid state objects (replaced by `src/game` factories
  once phase 1 exists).
- `tests/db/rpc.test.js` — 16 tests covering: home creation and the join/migrate events,
  version density, code case-insensitivity, second-device linking by partner name, the
  `home_full` trigger, join idempotency, CAS happy path, duplicate event idempotency,
  stale-version rejection followed by a rebase, invalid-state and clock-skew rejection
  without side effects, non-member writes, reset/leave semantics, and RLS visibility.

Two purposes: it exercises the DB architecture now, and it is the executable spec for
the PL/pgSQL functions. When writing the Postgres RPCs, port `localDb.js` function by
function and keep the return shapes identical (`{ ok, code, state, version, event }`).

Rules for the harness:

- Test infrastructure only. Nothing in `tests/db/` is imported by the app.
- Keep `schema.sql` in lock-step with the Postgres migration. Any column added to a
  migration is added here in the same commit.
- Prefer adding a Tier B test to adding a Tier C test: if a behaviour can be proven
  against the harness, prove it there and let Tier C confirm parity.

## 2b. Tier B2: browser end-to-end (built, passing)

`tests/e2e/run.mjs` starts a static server and `tests/e2e/fakeSupabaseServer.mjs` (an HTTP
front on the SQLite harness with a polling `/events` feed), launches headless Chromium, and
runs two scenarios: `local.mjs` (single device, phase 1 loop, time travel, anniversary,
memories, playground, landing) and `shared.mjs` (two isolated browser contexts: pairing with
migration of a local Plush, deep-link join, live remote events, simultaneous commits
converging, offline queue and flush, settings propagation, reload). The app is switched to
the fake through the `window.__plushClientFactory` hook read by `src/sync/client.js`.
Presence is a no-op in the fake; Realtime is emulated by polling.

## 3. Known differences between the harness and Postgres

| Postgres | SQLite harness | Consequence |
|---|---|---|
| `uuid` / `jsonb` / `timestamptz` | `TEXT` | JSON is parsed in JS; timestamps are ISO strings; no jsonb operators are used anywhere, by design. |
| `auth.uid()` | explicit `userId` argument | Tier C must assert that the RPCs read the caller from `auth.uid()` and ignore any client-supplied id. |
| RLS policies | `selectAsUser` helper | Tier C must prove RLS with a second anonymous user, not the helper. |
| `select … for update` | `BEGIN IMMEDIATE` | Same outcome (serialised commits); Tier C should still run the concurrent-commit test against Postgres. |
| Realtime | none | Tier C only. |
| `partners_limit` trigger raises `P0001 home_full` | `RAISE(ABORT,'home_full')` | Client error mapping must key on the message text `home_full` in both. |
| `is_valid_state` accepts only the current version | harness accepts v1–v3 | Tighten the harness when phase 3 lands (one-line change). |

## 4. Phase 1 tests (Tier A, to be written with phase 1)

Unchanged from `phase-1-core-loop.md` section 13. They need no database. Once `src/game`
exists, `tests/db/fixtures.js` should import `createInitialState` instead of hand-rolling
a state, so the harness always uses real state shapes.

## 5. Tier C: deferred Supabase integration tests

**Precondition** (a later session, when a Supabase project and the connector are
available): migrations `0001`–`0003` applied; `config.js` filled; a test runner that can
create two anonymous sessions. Recommended shape: `tests/supabase/*.test.js` run with
`node --test`, guarded by `if (!process.env.SUPABASE_URL) skip`. They are excluded from
`npm test` and run with `npm run test:supabase`.

Setup helper (`tests/supabase/setup.js`): create two clients with
`signInAnonymously()`, and a `cleanup()` that deletes the created home via the service
role key (test-only; never shipped in `config.js`).

| # | Test | Asserts | Mirrors Tier B test |
|---|---|---|---|
| C1 | RPC parity | For each scenario in `tests/db/rpc.test.js`, run the same calls against Postgres and compare `ok/code/version/state` | all |
| C2 | auth.uid() binding | A client cannot commit as another partner by passing ids; `commit_action` uses the caller's membership | non-members cannot write |
| C3 | RLS read isolation | User 2 in home B selects zero rows from home A's `plush_state`, `plush_events`, `partners`, `members` | RLS emulation |
| C4 | No direct writes | `insert`/`update`/`delete` on every table from the anon role fails (except own `push_subscriptions` rows in phase 4) | — |
| C5 | Concurrent commits | Fire two `commit_action` calls with the same `expected_version` in parallel; exactly one `ok`, the other `version`; events stay dense | stale version rejected |
| C6 | Realtime delivery | Client B receives the INSERT on `plush_events` for A's commit within 2 s with `state_after` equal to A's returned state; B does **not** receive rows from other homes | — |
| C7 | Presence | Both partners' presence keys visible on `home:<id>`; leaving removes the key | — |
| C8 | Snapshot after gap | After 3 commits by A while B is disconnected, B's `home_snapshot()` returns version +3 and the last 30 events | — |
| C9 | Clock | `server_now()` within 5 s of the client clock; a `client_at` 6 min off returns `clock` | clock skew |
| C10 | Invite code uniqueness | 50 `create_home` calls produce unique codes | — |
| C11 | Migrations idempotent | Applying `0001`–`0003` twice fails only on already-exists errors, never leaves partial state (or use `if not exists` throughout) | — |
| C12 | Memories (phase 3) | `add_memory` dedupes on `(home_id, key)`; storage policy rejects a path with another home's id | — |
| C13 | Push (phase 4) | Users can insert/delete only their own `push_subscriptions`; `nudge` decay vector test passes in Deno | — |

Manual checks that stay manual (two real browsers/phones) are listed in the phase docs'
acceptance checklists; they are not duplicated here.

## 6. What "tests would be hard without Supabase" now means

Only Tier C is blocked. Everything that decides correctness of the data model, the CAS
protocol, pairing rules, and the event log is verifiable today with `npm run test:db`.
When the connector arrives, C1 (parity) is the first test to write, because it converts
the whole Tier B suite into a Postgres conformance suite for free.
