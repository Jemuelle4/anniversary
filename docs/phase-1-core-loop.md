# Phase 1 — Core loop (single device)

Status: **done** (spec). Implementation: not started.
Read `product-brief.md` first. This doc is self-contained for building phase 1; the
cross-phase `data-model.md` and `architecture.md` refine but do not contradict it.
If they ever disagree, the later-dated doc wins and must say so.

## 1. Goal

After phase 1 the couple can open `surprise.html` on one phone and find a Plush that has
four needs, a mood, six actions, and remembers everything across reloads. No backend.
Everything is testable with `node --test`.

Non-goals for phase 1: sharing between devices, partner names, levels, notifications.
Design every module so those can be added without rewriting it (see section 12).

## 2. Pages and navigation

| File | Role after phase 1 | Change |
|---|---|---|
| `index.html` | Anniversary landing (unchanged look). "Surprise!" goes to `surprise.html`. | Only change: script tag becomes `type="module"`. |
| `surprise.html` | **The Plush page.** Stage + HUD + dock. Back goes to `index.html`. | Rebuilt per section 9. Filename kept so the original gift link keeps working. |
| `actions.html` | **Playground.** The original stateless sandbox, unchanged behaviour. Linked from the Plush page menu as "Playground". Actions here never touch pet state. | Back goes to `surprise.html`. Uses the same stage module with `{ persistent: false }`. |

Navigation stays literal `window.location.href` changes.

## 3. Module layout

No bundler. Every page loads `app.js` as an ES module; `app.js` imports from `src/`.

```
app.js                     entry: detects page, wires nav, boots pet page or playground
src/game/constants.js      all tunable numbers (section 5–7) in one exported object
src/game/state.js          createInitialState(now), clampNeed, migrate(raw)
src/game/decay.js          applyDecay(state, now) -> state'
src/game/actions.js        ACTIONS catalogue, canApply(state, type, now), applyAction(state, type, now) -> { state, effects }
src/game/mood.js           moodFor(state) -> { mood, lowestNeed, thought }
src/game/bites.js          bitePoints(seed) -> Point[20]  (pure, seeded)
src/game/rng.js            mulberry32(seed) -> () => number in [0,1)
src/store/store.js         JSDoc typedef of the Store interface (no code beyond the typedef and a helper)
src/store/localStore.js    LocalStore implementing Store over localStorage
src/ui/stage.js            spawnPlush + the six animations (ported from app.js) + mood/sleep visuals
src/ui/hud.js              needs meters, mood label, "last cared for", thought bubble
src/ui/dock.js             action buttons, busy lock, cooldown display, label reveal
src/ui/toast.js            short reaction lines
src/pet.js                 pet page controller: load -> decay -> render -> dispatch loop
tests/*.test.js            node --test suites for everything under src/game and src/store
```

Rules for build agents:

- `src/game/**` and `src/store/**` must not reference `window`, `document`, or timers.
  They take `now` (ms epoch) as a parameter. This is what makes them testable.
- `src/ui/**` may touch the DOM and must not compute game rules. It calls `src/game`.
- `styles.css` stays the single stylesheet. New rules are appended under a
  `/* ---- Plush (phase 1) ---- */` banner.
- Because ES modules do not load over `file://`, the repo must be served:
  `python3 -m http.server 8000` or `npx serve .`. Update `CLAUDE.md` to say so.

## 4. State schema (v1)

Stored as JSON. All times are ms since epoch from `Date.now()`.

```json
{
  "version": 1,
  "createdAt": 1758200000000,
  "updatedAt": 1758200000000,
  "needs": { "fullness": 80, "fun": 80, "love": 80, "energy": 100 },
  "asleep": false,
  "sleepStartedAt": null,
  "bites": { "seed": 1934812, "count": 0 },
  "cooldowns": { "boom": 0 },
  "lastAction": null,
  "counters": { "feed": 0, "cuddle": 0, "play": 0, "nibble": 0, "boom": 0, "sleep": 0, "wake": 0, "eaten": 0 }
}
```

Field notes:

- `needs.*` are integers 0–100 in storage; decay math uses floats internally and rounds
  on store (`Math.round`). Rounding once per save is acceptable drift.
- `updatedAt` is the time up to which decay has been applied. Every state-changing
  function sets it to `now`.
- `sleepStartedAt` is null unless `asleep` is true.
- `bites.seed` is a 32-bit integer; `bites.count` is 0–20 (20 means the "eaten" respawn
  fires, see 6.4).
- `cooldowns.<action>` is the epoch ms at which the action becomes available again.
- `lastAction` is `{ "type": "feed", "at": 1758200000000 }` or null. Phase 2 adds `by`.

`createInitialState(now)` returns exactly the object above with `createdAt = updatedAt =
now` and a random seed. `migrate(raw)` returns a valid v1 state from any input: unknown
or corrupt input yields `createInitialState(now)`; a v1 object is returned with missing
fields defaulted. Future versions add cases here.

## 5. Needs and decay

Four needs, each 0–100.

| Need | Meaning | Icon | Decay/hour awake | Decay/hour asleep |
|---|---|---|---|---|
| fullness | Has been fed | 🍞 | 4 | 2 |
| fun | Has been played with | 🎾 | 3 | 1 |
| love | Has been cuddled | 💗 | 2 | 1 |
| energy | Is rested | ⚡ | 3 | **+15** (regenerates) |

`applyDecay(state, now)`:

```
elapsedH = max(0, now - state.updatedAt) / 3_600_000    // clock went backwards => 0
rates = state.asleep ? RATES.asleep : RATES.awake
for each need n:
  next = state.needs[n] - rates[n] * elapsedH             // rates.energy is negative when asleep
  state.needs[n] = clamp(next, DECAY_FLOOR, 100)
if state.asleep and state.needs.energy >= 100 and (now - state.sleepStartedAt) >= MIN_SLEEP_MS:
  state = wake(state, now, { auto: true })                // Plush wakes itself once rested
state.updatedAt = now
```

Constants (in `constants.js`):

- `DECAY_FLOOR = 10`. Decay never drops a need below 10. Only actions can push lower
  (nibble, play, boom). This is the "never punishing" rule: a week away leaves Plush
  sulky but four taps away from happy.
- `MIN_SLEEP_MS = 30 * 60_000`.

Decay is applied lazily: on page load, on `visibilitychange` to visible, on a 30-second UI
tick while the page is open, and immediately before any action is applied. Timers only
trigger a recompute; they never accumulate decay themselves.

## 6. Actions

`ACTIONS` is an ordered array; the order is the dock order. Each entry:

```js
{ type: "feed", label: "Feed", emoji: "🍞", anim: "feed" }
```

Order: feed, cuddle, play, nibble, boom, sleep (sleep renders as "Wake" while asleep).

`canApply(state, type, now)` returns `{ ok: true }` or `{ ok: false, reason }` with
`reason` one of `asleep | cooldown | tooTired | stuffed`. The UI uses `reason` to pick a
toast; game logic uses it to refuse the action. `applyAction` must call `applyDecay`
first, then `canApply`, then the effect. It returns `{ state, effects }` where `effects`
is an array of tags the UI plays, for example `["anim:feed", "toast:feed.ok"]`,
`["anim:nibble", "bites:respawn", "toast:nibble.eaten"]`.

Every successful action sets `lastAction = { type, at: now }` and increments
`counters[type]`. Needs are clamped to 0–100 after effects.

### 6.1 Feed

- Effect: fullness +30, fun +5.
- Refused with `stuffed` when fullness ≥ 95. Toast: "Plush is stuffed."
- Animation: plush pops in, `chomp` keyframe ×2, a 🍞 emoji drops from the top of the
  stage into the plush and fades (new keyframe `foodDrop`, 700 ms).

### 6.2 Cuddle (existing `runLove`)

- Effect: love +25, fun +5. Removes up to 5 bite marks (`bites.count = max(0, count-5)`).
- Never refused while awake.
- Animation: existing hearts + "I LOVE YOU!" text, unchanged.

### 6.3 Play (existing `runThrow`)

- Effect: fun +25, energy −10, fullness −5.
- Refused with `tooTired` when energy < 15. Toast: "Plush is too tired to play."
- Animation: existing physics throw, unchanged, except the thrown sprite must carry the
  current bite mask (section 8).

### 6.4 Nibble (existing `runBite`)

- Effect: fun +8, love −3, `bites.count += 1`.
- Never refused while awake.
- When `bites.count` reaches 20: the plush fades out (existing `fade-out`), `counters.eaten
  += 1`, `bites = { seed: newRandomSeed, count: 0 }`, love −10, fun +15, and after 1200 ms
  the plush pops back in whole. Toast: "You ate Plush. Plush is back. Plush remembers."
  Effects tag: `bites:respawn`.
- Animation: existing chomp + spiral mask.

### 6.5 Boom (existing `runExplode`)

- Effect: fun +15, energy −15, clears all bite marks (`bites.count = 0`, seed kept).
- Refused with `tooTired` when energy < 20; refused with `cooldown` until
  `cooldowns.boom`. Sets `cooldowns.boom = now + 60_000` on success.
- Animation: existing shake → explode → burst + particles; then the plush pops back in
  after 900 ms (new; the original left the stage empty).

### 6.6 Sleep / Wake

- `sleep`: sets `asleep = true`, `sleepStartedAt = now`. Refused with `asleep` if already
  asleep. Animation: plush dims (`.plush.asleep`: brightness .6), three "z" glyphs float
  up on a loop (new keyframe `zz`, 2400 ms, staggered).
- `wake`: sets `asleep = false`, `sleepStartedAt = null`. If slept < `MIN_SLEEP_MS`:
  fun −5 and toast "Plush is grumpy." Otherwise fun +5 and toast "Plush woke up rested."
  Auto-wake from decay uses the rested branch and shows no toast.
- While asleep every other action is refused with `asleep`. The dock still shows them,
  dimmed; tapping one performs `wake` instead and then shows the grumpy/rested toast.
  It does **not** also perform the tapped action.

### 6.7 Busy lock (UI only)

While an animation is playing the dock ignores taps for `BUSY_MS` (feed 900, cuddle 600,
play 1200, nibble 300, boom 1500, sleep/wake 400). This is not a game rule and lives in
`dock.js`. Tests for `applyAction` do not model it.

## 7. Mood

`moodFor(state)` is pure and derived; never stored.

```
score = 0.30*fullness + 0.30*fun + 0.25*love + 0.15*energy
lowest = need with the smallest value
mood =
  asleep                 -> "sleeping"
  score >= 85            -> "ecstatic"
  score >= 65            -> "happy"
  score >= 45            -> "okay"
  score >= 25            -> "meh"
  else                   -> "sulky"
caps: if any need < 20 the mood is at most "meh"; if any need < 10 it is "sulky"
thought = lowest need's icon when its value < 40 and not asleep, else null
```

Display words: Sleeping, Ecstatic, Happy, Okay, Meh, Sulky.

Mood visuals (single image, CSS only; class `.plush.mood-<mood>` on the sprite):

| Mood | Idle motion | Filter |
|---|---|---|
| ecstatic | `bob` keyframe 1.6 s (±6 px), occasional ✨ particle every 4 s | none |
| happy | `breathe` keyframe 3 s (scale 1↔1.02) | none |
| okay | `breathe` 4 s | none |
| meh | none, `rotate(-6deg)` | `saturate(.8)` |
| sulky | none, `rotate(-10deg)` | `saturate(.55) brightness(.85)`; "…" bubble every 6 s |
| sleeping | none | `brightness(.6)`; z's |

The thought bubble is a small glass pill above the plush with the icon of the lowest need.
It is the primary "what does Plush want" signal; the meters are secondary.

## 8. Bite marks

Bite geometry is ported from `initBiteState` in the current `app.js` but made pure and
deterministic: `bitePoints(seed)` returns the 20 spiral points using `mulberry32(seed)`
instead of `Math.random`. The mask applied to the sprite is
`svgMaskDataUrl(bitePoints(seed).slice(0, count))`. Any sprite spawned on the stage
(pop, throw, respawn) gets the current mask applied immediately so bites persist across
reloads and across animations. Determinism matters now for reload consistency and in phase
2 so both partners see identical marks.

## 9. Plush page layout (`surprise.html`)

Mobile-first, one column, full height, dark page variant from existing CSS.

```
+--------------------------------------------------+
| ← Back                              Playground ≡ |   top bar (glass)
|                                                  |
|  🍞 ████████░░  🎾 █████░░░░░                     |   HUD: 2×2 meters
|  💗 ██████░░░░  ⚡ ███████░░░                     |
|  Happy · fed 2h ago                              |   mood line
|                                                  |
|                  [ 🍞 ]  <- thought bubble       |
|                                                  |
|               (   plush   )                      |   stage (existing .stage)
|                                                  |
|                                                  |
| [Feed]   [Cuddle]  [Play]                        |   dock: 3×2 grid
| [Nibble] [Boom]    [Sleep]                       |
+--------------------------------------------------+
```

- HUD is absolutely positioned inside the stage at the top so animations can pass
  behind it; it uses the existing glass tokens (`--glass-*`).
- Meters: 8 px tall rounded bars, colour by value: ≥60 beige `--beige`, 30–59 amber
  `--accent`, <30 `#ff5a5a`. Width transitions 400 ms.
- Mood line: `<mood> · last cared for <relative time>` where relative time is from
  `lastAction.at` ("just now", "5m ago", "2h ago", "3d ago"). No `lastAction` → "new".
- Dock: the existing `.dock` glass, `.dock-actions` becomes `grid-template-columns:
  repeat(3, 1fr)`. Buttons keep the "Click!" label-reveal behaviour on first tap
  (`revealLabelIfNeeded`), which is part of the original gift. Sleep's revealed label
  is "Sleep" or "Wake" depending on state. A disabled-looking state (opacity .5) is used
  for cooldown and asleep; a small countdown "42s" replaces the label during boom cooldown.
- Toasts: one at a time, bottom-centre above the dock, 1800 ms, glass pill.
- Top bar: Back (left), menu button (right) opening a small sheet with "Playground" and
  "Reset Plush" (confirm dialog; calls `store.clear()` then `createInitialState`).

Desktop (≥900 px): same layout, stage capped at 1100 px wide and centred.

## 10. Controller loop (`src/pet.js`)

```
boot():
  store = new LocalStore()
  state = migrate(await store.load()) ?? createInitialState(now)
  state = applyDecay(state, now); await store.save(state)
  render(state)
  every 30 s and on visibilitychange(visible): state = applyDecay(state, now); save; render
dispatch(type):
  if dock.busy: return
  now = Date.now()
  { state: next, effects } = applyAction(state, type, now)   // includes decay + canApply
  if refused: toast(reason); if reason == "asleep": dispatch("wake"); return
  state = next; await store.save(state)
  stage.play(effects); hud.render(state); dock.render(state)
```

`render(state)` is idempotent: HUD, dock, mood class, and the mask are all derived from
state on every call. Animations are triggered only from `effects`, never from render.

## 11. Store interface and LocalStore

```js
/** @typedef {{ load(): Promise<object|null>, save(state: object): Promise<void>, clear(): Promise<void> }} Store */
```

`LocalStore` uses key `plush.v1.state`. `load` returns the parsed object or null on
missing/invalid JSON. `save` writes `JSON.stringify(state)`; if storage throws (private
mode, quota) it logs once and continues in memory. Phase 2 adds `subscribe(cb)` and
`applyEvent(event)`; phase 1 code must only use `load`/`save`/`clear` so the swap is
mechanical.

## 12. Forward-compatibility hooks

- `applyAction` takes `type` and `now` only. Phase 2 wraps it in an event
  `{ id, type, at, by }` and applies the same function server-side in SQL and
  client-side in JS. Keep the arithmetic trivially portable (integers, no `Math.random`
  except the respawn seed, which the event will carry).
- `lastAction` gets a `by` field in phase 2; render code should tolerate its absence.
- `stage.js` exposes `play(effects)` so a partner's remote actions replay identically.

## 13. Tests (`npm test`)

Node 22.13+ with the built-in runner (the DB harness in `tests/db/` needs `node:sqlite`).
No test dependencies. Every test constructs states with a fixed `now`. Test files are
named `*.test.js` so the `npm test` glob finds them.

- `decay.test.js`: 1 h awake drops fullness by 4; asleep energy rises 15/h and other needs
  use asleep rates; floor at 10; clock backwards → no change; auto-wake after ≥30 min at
  100 energy; auto-wake does not fire before 30 min.
- `actions.test.js`: each action's numeric effects; clamp at 100 and 0; feed refused when
  ≥95; play refused < 15 energy; boom refused < 20 energy and during cooldown, cooldown
  set to now+60 000; nibble increments count; 20th nibble respawns with new seed, love −10,
  fun +15, eaten counter +1, effects include `bites:respawn`; cuddle removes ≤5 bites;
  boom clears bites; sleep/wake transitions and grumpy/rested branches; every action
  refused with `asleep` while asleep except wake; `applyAction` applies decay first
  (feed after 1 h from 80 yields 80−4+30=106→100).
- `mood.test.js`: threshold boundaries at 85/65/45/25; any need <20 caps at meh; <10 →
  sulky; asleep → sleeping; thought is lowest-need icon only when <40.
- `bites.test.js`: same seed → identical 20 points; all points inside 5–95; radii 8–13.
- `state.test.js`: `migrate` on null/garbage/partial v1 yields valid state; initial state
  matches schema.
- `localStore.test.js`: with a fake `localStorage` object injected via constructor
  option, load/save/clear round-trip and invalid JSON → null.

## 14. Acceptance checklist (build agent verifies before marking phase 1 done)

- [ ] `python3 -m http.server` then open `index.html` → Surprise → Plush page renders with
      four meters, mood, thought bubble logic, six buttons.
- [ ] Each of the six actions plays its animation and updates meters; toasts show for
      refused actions.
- [ ] Reload keeps needs, bites, sleep state, and cooldown.
- [ ] Editing `updatedAt` in localStorage to 24 h ago and reloading shows decayed needs at
      the floor where appropriate and mood "sulky"/"meh".
- [ ] Sleep → wait (or edit timestamps) → auto-wake at 100 energy.
- [ ] Playground page still behaves exactly like the original sandbox.
- [ ] `npm test` passes (Tier A + the existing Tier B DB harness).
- [ ] `prefers-reduced-motion` keeps the page usable (idle motions off, animations 1 ms).
- [ ] `CLAUDE.md` updated: module layout, "serve, don't open file://", test command.

## 15. Copy (reaction lines)

| Key | Text |
|---|---|
| feed.ok | "Nom. Plush is fuller." |
| feed.stuffed | "Plush is stuffed." |
| cuddle.ok | "Plush feels loved." |
| play.ok | "Wheee!" |
| play.tooTired | "Plush is too tired to play." |
| nibble.ok | "Nibble. Plush is unbothered. Mostly." |
| nibble.eaten | "You ate Plush. Plush is back. Plush remembers." |
| boom.ok | "BOOM. Plush reassembles." |
| boom.tooTired | "No energy for a boom." |
| boom.cooldown | "Boom is recharging." |
| sleep.ok | "Shh. Plush is sleeping." |
| wake.rested | "Plush woke up rested." |
| wake.grumpy | "Plush is grumpy." |
| reset.done | "A brand new Plush." |

## 16. Assumptions

- The couple is fine with a single fixed pet name "Plush" in phase 1.
- One localStorage origin per device is acceptable; two browsers on one phone would be two
  Plushes until phase 2.
- No analytics or error reporting in phase 1.
