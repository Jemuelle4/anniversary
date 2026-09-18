# Data model (canonical, all phases)

Status: **done**. This is the single reference for the state object, the database, the
event catalogue, and the effect tags. Phase docs introduced these incrementally; if a
phase doc and this file disagree on a field, this file wins.

## 1. Client state object (schema version 3)

```json
{
  "version": 3,
  "createdAt": 1758200000000,
  "updatedAt": 1758200000000,
  "needs": { "fullness": 80, "fun": 80, "love": 80, "energy": 100 },
  "asleep": false,
  "sleepStartedAt": null,
  "bites": { "seed": 1934812, "count": 0 },
  "cooldowns": { "boom": 0 },
  "lastAction": { "type": "feed", "at": 1758200000000, "by": "uuid-or-null" },
  "counters": { "feed": 0, "cuddle": 0, "play": 0, "nibble": 0, "boom": 0, "sleep": 0, "wake": 0, "eaten": 0 },
  "progress": {
    "carePoints": 0,
    "level": 1,
    "today": null,
    "dailyPoints": {},
    "rituals": { "breakfast": null, "playtime": null, "goodnight": null },
    "streak": { "count": 0, "lastFullDay": null, "freezeUsedWeek": null }
  }
}
```

| Field | Type | Introduced | Notes |
|---|---|---|---|
| `version` | 1 / 2 / 3 | p1 | `migrate()` upgrades in order v1→v2→v3 |
| `createdAt`, `updatedAt` | ms epoch | p1 | `updatedAt` = time decay has been applied up to |
| `needs.*` | int 0–100 | p1 | rounded on store |
| `asleep`, `sleepStartedAt` | bool, ms/null | p1 | |
| `bites.seed`, `bites.count` | int32, 0–20 | p1 | geometry = `bitePoints(seed).slice(0, count)` |
| `cooldowns.boom` | ms epoch | p1 | available when `now >= value` |
| `lastAction` | object/null | p1 (`by` p2) | `by` is a partner uuid or null |
| `counters.*` | int | p1 | `eaten` counts respawns |
| `progress.*` | object | p3 | see phase 3 sections 2–6 |

Invariants checked by `is_valid_state` (SQL) and `assertValidState` (JS, tests):
version ∈ {3}; each need is a finite number in 0–100; `bites.count` ∈ 0–20; `asleep` is
boolean; `progress.level` ∈ 1–10.

## 2. Constants (`src/game/constants.js`)

```
NEEDS = ["fullness","fun","love","energy"]
INITIAL_NEEDS = { fullness: 80, fun: 80, love: 80, energy: 100 }
RATES.awake  = { fullness: 4, fun: 3, love: 2, energy: 3 }       // per hour, subtracted
RATES.asleep = { fullness: 2, fun: 1, love: 1, energy: -15 }     // negative = regenerates
DECAY_FLOOR = 10
MIN_SLEEP_MS = 1_800_000
MAX_BITES = 20
BOOM_COOLDOWN_MS = 60_000
MOOD_WEIGHTS = { fullness: .30, fun: .30, love: .25, energy: .15 }
MOOD_THRESHOLDS = { ecstatic: 85, happy: 65, okay: 45, meh: 25 }
THOUGHT_BELOW = 40
CARE_POINTS = { feed: 3, cuddle: 3, play: 3, sleep: 2, nibble: 1, boom: 1, wake: 0 }
DAILY_POINT_CAP = 30
LEVEL_THRESHOLDS = [0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100]
LEVEL_TITLES = ["Newborn","Little","Cosy","Bright","Bold","Beloved","Radiant","Legendary","Mythic","Forever"]
STREAK_MILESTONES = [7, 30, 100, 365]
RITUAL_WINDOWS = { breakfast: [5, 12), goodnight: [20, 24) ∪ [0, 3) }   // playtime: any
```

## 3. Action effects (summary; phase 1 section 6 is normative)

| Type | fullness | fun | love | energy | other | refused when |
|---|---|---|---|---|---|---|
| feed | +30 | +5 | | | | asleep; fullness ≥ 95 (`stuffed`) |
| cuddle | | +5 | +25 | | bites −5 (min 0) | asleep |
| play | −5 | +25 | | −10 | | asleep; energy < 15 (`tooTired`) |
| nibble | | +8 | −3 | | bites +1; at 20 → respawn: new seed, count 0, love −10, fun +15, eaten +1 | asleep |
| boom | | +15 | | −15 | bites 0; cooldown 60 s | asleep; energy < 20; cooldown |
| sleep | | | | | asleep = true | already asleep |
| wake | | ±5 | | | asleep = false; grumpy if < 30 min | not asleep |

All successful actions: `lastAction`, `counters`, care points (if a need moved ≥ 5,
daily cap), rituals (by window), streak (on third ritual).

## 4. Effect tags (returned by `applyAction`, consumed by `stage.js`/`toast.js`)

```
anim:feed | anim:cuddle | anim:play | anim:nibble | anim:boom | anim:sleep | anim:wake
bites:respawn
toast:<key>            (keys in phase 1 section 15 plus ritual/level/streak lines)
ritual:<name>          (breakfast|playtime|goodnight)
celebrate:level | celebrate:streak | celebrate:anniversary
```

`effectsFor(eventRow)` reproduces these from `type`, `payload`, and the diff between the
previous state and `state_after` (level/streak changes), so remote replays match.

## 5. Database

Tables (owner: migrations in `supabase/migrations/`):

| Table | Key | Purpose | Client access |
|---|---|---|---|
| `homes` | id | one per couple; `invite_code`, `timezone`, `anniversary_date` | select own |
| `partners` | id | ≤2 per home; `name`, `color` | select own home |
| `members` | user_id | auth user → partner | select own home |
| `plush_state` | home_id | `version`, `state` jsonb, `updated_at` | select own |
| `plush_events` | id (client uuid) | append-only; `type`, `version`, `client_at`, `payload`, `state_after` | select own; Realtime INSERT |
| `memories` | id | journal rows; unique `(home_id, key)` | select own |
| `push_subscriptions` | id | per device push endpoint | select/insert/delete own rows |

Storage: bucket `memories`, private, path `memories/<home_id>/<uuid>.jpg`.

RPCs (all `security definer`):

| RPC | Phase | Purpose |
|---|---|---|
| `server_now()` | 2 | clock offset |
| `create_home(name, color, initial_state, timezone)` | 2/3 | new home + partner + member + state |
| `join_home(code, name, color)` | 2 | join or link a second device |
| `home_snapshot()` | 2 | boot payload |
| `commit_action(event_id, type, client_at, expected_version, new_state, payload)` | 2 | the CAS write |
| `reset_home(new_state)` | 2 | fresh Plush, records `reset` |
| `leave_home()` | 2/4 | remove own membership |
| `update_home(timezone, anniversary_date)` | 3 | settings |
| `update_partner(name, color)` | 3 | settings |
| `add_memory(kind, key, caption, photo_path, happened_at)` | 3 | journal write (dedupe on key) |
| `list_memories(before, limit)` | 3 | journal page |
| `delete_memory(id)` | 4 | removes row; client removes the storage object first |

## 6. Event types (`plush_events.type`)

`feed cuddle play nibble boom sleep wake` (actions) · `join` (payload `{name, color}`) ·
`migrate` (payload `{from: "local"}`) · `reset` · `settings` (payload with changed keys;
phase 3). Every event carries `state_after`; `version` is dense per home starting at 1.

## 7. Local storage keys

| Key | Content |
|---|---|
| `plush.v1.state` | phase 1 state (renamed to `.migrated` after pairing) |
| `plush.v2.cache` | last known `{ state, version, partners, me, events }` snapshot |
| `plush.v2.outbox` | pending events array |
| `plush.celebrated.<year>` | anniversary celebration shown flag |
| `sb-*` | Supabase session (managed by the client library) |
