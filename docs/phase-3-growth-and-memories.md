# Phase 3 — Growth, rituals, streaks, and memories

Status: **done** (spec). Implementation: **done** (local mode fully; Supabase memories/storage written but unapplied).

## 1. Goal

Give the couple reasons to come back that are about *them*, not just about meters:
Plush grows with accumulated care, three small daily rituals create a shared rhythm, a
streak rewards consistency without punishing a missed day, a journal keeps moments
(auto milestones and their own photos), and the anniversary itself is celebrated by Plush.

## 2. Care points and levels

Every successful action awards care points **only if it changed at least one need by 5
or more** (so saturated spam earns nothing):

| Action | Points |
|---|---|
| feed, cuddle, play | 3 |
| sleep | 2 |
| nibble, boom | 1 |
| wake | 0 |

Per-partner daily cap: 30 points (resets at the home's local midnight, section 4). The
cap rewards showing up over grinding.

Levels from cumulative points. `levelFor(points)` uses thresholds
`[0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100]` for levels 1–10; level 10 is the max.
Titles: Newborn, Little, Cosy, Bright, Bold, Beloved, Radiant, Legendary, Mythic, Forever.
Display: `Lv 4 · Bright Plush` in the HUD mood line's second row, plus a thin progress bar
to the next level.

Visuals per level (CSS only): sprite scale `1 + 0.025 × (level − 1)` (max 1.225 at 10);
from level 5 a faint warm glow (`drop-shadow(0 0 18px rgba(255,200,120,.35))`); at 10 a
slow shimmer. No new art required; `photos/` or a future `plush-lv10.png` may be swapped
in by the couple later via a documented optional slot in `stage.js`.

Level-up celebration: the `burst` + `particle` effects from Boom **without** the plush
exploding, plus hearts, plus a toast "Plush grew! Lv 5 · Bold Plush". Effect tag
`celebrate:level`.

## 3. Daily rituals

Three rituals per home per day; either partner can complete any of them:

| Ritual | Completed by | Window (home local time) |
|---|---|---|
| Breakfast | `feed` | 05:00–11:59 |
| Playtime | `play` | any time |
| Goodnight | `sleep` | 20:00–02:59 (spans midnight; belongs to the day it started if before midnight, else to the previous day) |

Completing all three is a **full day**. The HUD shows a compact checklist row
`☑ Breakfast ☐ Playtime ☐ Goodnight` under the meters; completing one plays a small
tick animation and a toast ("Breakfast done · Sam").

## 4. Time zones and day keys

`homes.timezone` (IANA string) is chosen at `create_home` from the creator's
`Intl.DateTimeFormat().resolvedOptions().timeZone`, editable in settings. All "today"
logic uses `dayKey(now, tz)` → `YYYY-MM-DD` computed with `Intl.DateTimeFormat` in
`src/game/time.js`. This works in Node without dependencies, so it stays pure and tested.
`applyAction` and `applyDecay` gain an optional `ctx = { partnerId, timezone }` argument;
missing `ctx` means "phase 1 behaviour" so old tests still pass.

Rollover (`rolloverIfNeeded(state, now, tz)`) runs at the start of `applyDecay`: when
`progress.today !== dayKey(now)`, evaluate the streak (section 5), reset `rituals` and
`dailyPoints`, set `today`.

## 5. Streaks

`streak = { count, lastFullDay, freezeUsedWeek }`.

- When the third ritual of day D completes: if `lastFullDay` is D−1 → `count += 1`;
  else if `lastFullDay` is D−2 and no freeze was used in the current ISO week →
  `count += 1`, `freezeUsedWeek = isoWeek(D)` (toast "Plush understood. Streak kept.");
  else `count = 1`. Set `lastFullDay = D`.
- Rollover never zeroes the display; a lapsed streak simply restarts at 1 on the next full
  day. The HUD shows `🔥 12` only when `count ≥ 2`.
- Milestones at 7, 30, 100, 365 trigger `celebrate:streak` (same visuals as level-up) and
  an auto memory.

## 6. State schema (v3)

Adds to v2:

```json
{
  "version": 3,
  "progress": {
    "carePoints": 0,
    "level": 1,
    "today": "2026-09-18",
    "dailyPoints": { "<partnerId>": 0 },
    "rituals": { "breakfast": null, "playtime": null, "goodnight": null },
    "streak": { "count": 0, "lastFullDay": null, "freezeUsedWeek": null }
  }
}
```

`rituals.<name>` is `null` or `{ "by": "<partnerId>", "at": 1758200000000 }`.
`migrate` v2 → v3 adds `progress` with zeros and `today = null` (first decay sets it).
`is_valid_state` in SQL gains `version = 3` and `progress.level` in 1–10.

## 7. Memories

New table and storage bucket (migration `0002_memories.sql`):

```sql
create table memories (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references homes(id) on delete cascade,
  partner_id uuid references partners(id),      -- null for auto milestones
  kind       text not null,                     -- moment|level|streak|eaten|anniversary|joined
  key        text,                              -- dedupe key for auto kinds, e.g. level:5
  caption    text check (char_length(caption) <= 140),
  photo_path text,                              -- storage path memories/<home_id>/<uuid>.jpg
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (home_id, key)
);
-- RLS: select where home_id = my_home_id(); writes only via RPCs
-- storage bucket "memories" (private); policy: authenticated users may read/insert objects
-- whose first path segment equals my_home_id()::text; no delete in phase 3
```

RPCs: `add_memory(p_kind, p_key, p_caption, p_photo_path, p_happened_at)` → row
(`on conflict (home_id, key) do nothing` for auto kinds; returns existing), and
`list_memories(p_before timestamptz, p_limit int)`.

Auto memories are created by the client that observed the milestone (both clients will
try on remote events; the unique key makes that safe):

| Kind | Key | Caption |
|---|---|---|
| joined | `joined:<partnerId>` | "<Name> moved in" |
| level | `level:<n>` | "Plush became <Title> Plush" |
| streak | `streak:<n>` | "<n> days of looking after Plush together" |
| eaten | `eaten:<n>` (n = counters.eaten) | "<Name> ate Plush. Plush came back." |
| anniversary | `anniversary:<year>` | "Year <n> together" |

Manual moments: menu → "Add a moment" → sheet with caption (≤140) and optional photo.
Photos are resized client-side with a canvas to max 1600 px on the long edge, JPEG 0.82,
uploaded to `memories/<home_id>/<uuid>.jpg`, then `add_memory('moment', null, caption,
path)`. Read via signed URLs (`createSignedUrl`, 1 h) so the bucket stays private.

`memories.html`: a new page, reverse-chronological list; each card shows the photo (if
any), caption, kind icon, partner swatch/name, and date; infinite scroll in pages of 20
via `list_memories`. Back → `surprise.html`. Uses the light page variant from `index.html`
so it feels like the photo wall the gift started with.

## 8. Anniversary

`homes.anniversary_date` (date, nullable), set in settings (menu → Settings: my name,
my colour, home timezone, anniversary date, invite code). The current landing headline
says "5 Year" statically; phase 3 makes the landing compute the number from the cached
home (`plush.v2.cache`) when present and otherwise keeps the static text, so the gift
page never breaks.

On the anniversary day (home local time):

- The Plush page shows a banner "Happy <n> Year Anniversary!" in the landing's accent
  style, Plush gets a 🎉 emoji hat overlay (`.plush-hat`), and every action also spawns
  hearts.
- Opening the page that day fires `celebrate:anniversary` once per device (localStorage
  flag `plush.celebrated.<year>`), and the auto memory is added.
- Menu shows "<n> days to your anniversary" for the rest of the year; "Monthiversary" is
  a one-line toast on the same day-of-month, no memory.

## 9. UI summary

- HUD: second line `Lv 4 · Bright · 🔥 12` with a 3 px level progress bar; rituals row.
- Celebrations reuse Boom's burst/particles and Cuddle's hearts; no new keyframes except
  a `tick` (checkbox pop) and `hatBob`.
- Menu: Activity, Memories, Add a moment, Settings, Invite code, Playground, Reset Plush.
- Feed lines gain "leveled Plush up to 5" and "started a streak" entries derived from
  events (no new event types; derived from `state_after.progress`).

## 10. Tests

- `progress.test.js`: points only when a need moved ≥5; daily cap per partner; level
  thresholds; level never decreases; `celebrate:level` effect fires exactly when level
  changes.
- `rituals.test.js`: windows with fixed timezone (`Asia/Manila` and `America/Los_Angeles`
  both covered); goodnight after midnight belongs to previous day; completing all three
  marks a full day once.
- `streak.test.js`: consecutive days increment; one-day gap with freeze keeps streak once
  per ISO week; second gap resets to 1; milestones fire once.
- `time.test.js`: `dayKey` across DST and midnight boundaries; `isoWeek`.
- `migrate.test.js`: v2 → v3.
- Manual: two-browser milestone dedupe (both see one "level:5" memory); photo upload and
  signed URL display; anniversary day simulation by setting `anniversary_date` to today.

## 11. Assumptions

- Care points are per home but capped per partner per day; there is deliberately no
  "who cares more" scoreboard in the UI.
- Memories are never deleted in phase 3; a delete RPC is a phase 4 settings item.
- Storage free tier (1 GB) is far above a couple's photo usage at ~300 KB per photo.

## Implementation notes

- Local mode keeps memories in `localStorage` (`plush.v1.memories`) with photos as data URLs
  so the journal works before a backend exists.
- The `joined` auto memory is not created (the `join` event in the activity feed covers it).
- Anniversary years are computed from the home's `anniversary_date` in the home timezone.
