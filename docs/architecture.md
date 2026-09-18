# Architecture (all phases)

Status: **done**. Consolidates decisions from the phase docs; where a phase doc is more
detailed, it wins on detail, this doc wins on shape.

## 1. Shape of the system

```
 phone A                          phone B
 +-------------------+            +-------------------+
 | static app        |            | static app        |
 |  src/ui  (DOM)    |            |  src/ui  (DOM)    |
 |  src/pet.js loop  |            |  src/pet.js loop  |
 |  src/game (pure)  |            |  src/game (pure)  |
 |  src/store        |            |  src/store        |
 |   LocalStore ---- localStorage |   SupabaseStore   |
 |   SupabaseStore   |            |                   |
 +---------+---------+            +---------+---------+
           | RPC commit_action / home_snapshot        | Realtime postgres_changes + presence
           v                                          v
        +-------------------------------------------------+
        | Supabase                                        |
        |  Postgres: homes, partners, members,            |
        |            plush_state (1 row/home, versioned), |
        |            plush_events (append-only),          |
        |            memories, push_subscriptions         |
        |  RLS: read own home; writes only via RPCs       |
        |  Storage bucket: memories (private)             |
        |  Edge Function: nudge (hourly web push)         |
        +-------------------------------------------------+
        Hosting: Vercel static (no build), sw.js for PWA
```

## 2. Layers and their contracts

| Layer | Directory | May import | Must not |
|---|---|---|---|
| Game rules | `src/game/` | other `src/game` files | touch DOM, timers, network, `Math.random` (except seed creation in `state.js`, which callers may override) |
| Store | `src/store/`, `src/sync/` | `src/game` (for rebase), Supabase client | render anything |
| Controller | `src/pet.js`, `app.js` | everything | contain game arithmetic |
| UI | `src/ui/` | `src/game/mood.js` and constants for display only | mutate state |

The store contract (final):

```js
/**
 * @typedef {object} Store
 * @prop {() => Promise<Snapshot|null>} load
 * @prop {(event: PendingEvent) => Promise<CommitResult>} commit
 * @prop {() => Promise<void>} clear
 * @prop {(cb: (msg: StoreMessage) => void) => () => void} subscribe
 */
```

Phase 1 ships `LocalStore` with `load`/`save`/`clear` only (phase 1 section 11). Phase 2
adds `commit` and `subscribe` to the interface; `LocalStore.commit` wraps `save` and
increments a local version, and `LocalStore.subscribe` is a no-op, so the controller has
one code path from phase 2 on.

## 3. Data flow for one action

```
tap -> dock.js -> pet.dispatch(type)
  -> applyDecay(state, now, ctx) -> canApply -> applyAction  (pure)
  -> optimistic: state', version+1 ; render(state') ; stage.play(effects)
  -> outbox.enqueue({ id, type, clientAt, expectedVersion, newState, payload })
  -> store.commit(event) -> RPC commit_action (row lock, version check, insert event)
       ok        -> done
       version   -> rebase remaining outbox events on server state, retry
       duplicate -> done
       clock     -> resync offset, retry once
  -> Realtime delivers the inserted plush_events row to the partner
       partner: version == mine+1 ? adopt state_after + play effectsFor(row) : snapshot()
```

Decay is a pure function of `(state, now)`; nothing on the server "ticks". The only
server-side arithmetic is the reminder function's ≤20-line decay copy, pinned by a shared
test-vector file.

## 4. Time

`clock.now()` = `Date.now() + offset`, offset from `server_now()` at boot and after any
`clock` rejection. All game functions take `now` explicitly. Day boundaries use the home's
IANA timezone via `Intl.DateTimeFormat` (`src/game/time.js`).

## 5. Identity and access

Anonymous Supabase auth per device → `members` row → `partners` row → `homes` row. The
invite code is the only secret and only grants membership. RLS: select within own home;
no client writes to any table except `push_subscriptions` (own rows). All other writes are
`security definer` RPCs listed in `data-model.md`.

## 6. Page map

| Page | Purpose | Store |
|---|---|---|
| `index.html` | Anniversary landing (the original gift), Surprise → `surprise.html` | none (reads cache for the year number in phase 3) |
| `surprise.html` | Plush | Supabase (or Local with `?local=1` / no config) |
| `actions.html` | Playground: original stateless sandbox | none |
| `memories.html` | Journal (phase 3) | Supabase |

Sheets (pairing, activity, settings, add moment, menu) are in-page overlays on
`surprise.html`, not separate pages.

## 7. Decision log

| # | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| 1 | Plain ES modules, no bundler | Vite/React | Repo principle; two-person app; keeps the gift page trivially hostable |
| 2 | Supabase for persistence | Firebase, custom server, CRDT over WebRTC | Postgres + RLS + Realtime + anon auth from one CDN script; tooling available |
| 3 | Client applies rules, server serialises via CAS RPC | PL/pgSQL port; Edge Function applying rules | One implementation of rules; correctness comes from row versioning, not from distrusting partners |
| 4 | Event log with full `state_after` snapshots | Replaying events to derive state | Snapshots make partner sync and gap recovery trivial; storage cost is negligible |
| 5 | Lazy decay from timestamps | Server cron ticking needs | Works with closed tabs; testable; no server load |
| 6 | Deterministic bite geometry from a stored seed | Storing 20 points | Tiny state, identical marks on both devices |
| 7 | Never-below-10 decay floor | Pet death / hard fail states | Product principle: never punishing |
| 8 | Single `plush.png` + CSS for moods and levels | Art per mood | No art dependency; art slots optional |
| 9 | One Edge Function (reminders) with a duplicated 20-line decay | Reuse `src/game` in Deno | Bundling `src/` from outside the functions dir is uncertain; a test vector pins the copy |
| 10 | Keep `surprise.html` filename for the pet page | New `plush.html` | The original gift link keeps working |

## 8. Non-functional targets

- Cold open with cached shell: < 1.5 s to first meaningful paint on 4G.
- Partner-to-partner latency while co-present: ~1 s (Realtime).
- Works offline for all actions; reconciles on reconnect with no lost actions.
- Zero dependencies at test time (`node --test`), one CDN dependency at runtime.
