# Plush — product brief

## One-liner

Plush is a tiny virtual pet that two people look after together. It lives at the same URL
as the anniversary page it grew out of, it is the same beige plush from `plush.png`, and
whatever one partner does to it, the other sees.

## Where it comes from

The current repo is a static anniversary gift: a landing page with two photos and a
"Surprise!" button, leading to a stage where a plush can be thrown, bitten, exploded, or
cuddled. Every click is stateless and forgotten on reload. Plush keeps all of that
(the animations are the personality of the product) and adds the two things that turn a
gag page into something people come back to: **needs that change over time** and
**state that is shared between the two of them**.

## Who it is for

Exactly two people: the couple who own this repo. There is no public signup, no
discovery, no social graph. "Users" in these docs always means the two partners.
Design consequences:

- Onboarding is a one-time pairing, not an account system.
- Nothing needs to scale. Correctness and delight beat throughput everywhere.
- Content can be personal (their photos, their anniversary date, inside jokes like
  the bite gag).

## What it must feel like

- **Alive.** Plush has moods that follow from how it has been treated and how long it
  has been left alone. Opening the page should always answer "how is Plush doing?"
  in under a second, without reading numbers.
- **Shared.** If one partner feeds Plush on the train, the other sees a fuller, happier
  Plush when they open it at lunch, and a short note saying who did what. When both are
  on at once, actions play live on both screens.
- **Light.** A visit is 20–60 seconds. There are no punishments that feel bad. Plush
  can be neglected and get sulky, but it never dies and never blames anyone.
- **Ours.** Milestones (the anniversary date, streaks, level-ups) are celebrated with the
  existing explode/hearts effects. Memories of moments together accumulate.

## Core loop (the whole product in five lines)

1. Open the page. Plush shows its mood and its four needs at a glance.
2. Do one or two things: feed, cuddle, play (throw), nibble, boom, or tuck it in.
3. Plush reacts with the existing animations plus a mood change.
4. Leave. Needs decay slowly in real time (hours, not minutes).
5. Partner opens later, sees what changed and who did it, and takes their turn.

## Principles for design and build decisions

1. **Keep the existing charm.** The four animations, the glass dock, the beige palette,
   and the "Click!" label reveal stay. New UI is added around them, not instead of them.
2. **Plain web.** No bundler, no framework, no package manager for the app itself.
   ES modules served statically. The only runtime dependency is the Supabase JS client
   loaded from a CDN (phase 2+).
3. **Logic is pure, UI is thin.** Needs, decay, moods, and action effects are pure
   functions over a plain state object. The DOM layer only renders state and dispatches
   actions. This is what makes the game testable without a browser.
4. **One source of truth for shared state.** From phase 2, the database row for the pet
   is the single source of truth and every write goes through one atomic
   compare-and-swap RPC. Two devices can never overwrite each other; the loser rebases.
   (Game arithmetic runs on the client in the same pure modules phase 1 tests.)
5. **Time is real time.** Decay is computed lazily from timestamps, never from timers
   that must be running. A closed tab is the normal case.
6. **Never punishing, always recoverable.** Every bad state (starving, sulking, fully
   bitten) has an obvious one-tap way back.
7. **Phones first.** Both partners will mostly use this on a phone. Layout, tap targets,
   safe-area insets, and reduced-motion support are requirements, not polish.

## Scope by phase

| Phase | Outcome for the couple | Spec |
|---|---|---|
| 1. Core loop | A single-device pet with needs, moods, six actions, and persistence across reloads | `phase-1-core-loop.md` |
| 2. Shared sync | Both partners see and affect the same Plush, live when co-present, with an activity feed | `phase-2-shared-sync.md` |
| 3. Growth & memories | Levels, daily rituals, streaks, a memory journal, milestone celebrations | `phase-3-growth-and-memories.md` |
| 4. Polish & launch | Installable PWA, reminders, accessibility, error/offline states, deployed on Vercel | `phase-4-polish-and-launch.md` |

Each phase is independently shippable. Phase 1 is deliberately useful on its own so that
the couple can play with it before any backend exists.

## Explicitly out of scope

- More than two participants, public sharing, leaderboards.
- Native apps. (PWA in phase 4 covers "on the home screen".)
- In-app purchases, cosmetics economy, ads.
- Pet death, permadeath, or any irreversible failure state.
- New character art as a hard requirement. All moods and stages must work with the
  single `plush.png` plus CSS. New art is an optional slot, never a blocker.

## Success criteria

- Both partners open Plush at least a few times a week for a month without being asked.
- Zero "who changed this?" confusion: every visible state change has an attributable
  cause in the feed.
- Phase 1 plays end-to-end in a static file server with no backend and passes its
  `node --test` suite.

## Glossary

- **Plush** — the pet (capitalised), and the product name.
- **Home** — the shared pet instance the two partners belong to (phase 2 concept).
- **Partner** — either of the two people. Each has a display name and a colour.
- **Need** — one of the four decaying meters: Fullness, Fun, Love, Energy.
- **Mood** — the derived, displayed state (Ecstatic, Happy, Okay, Meh, Sulky).
- **Action** — a user-initiated event that changes needs: Feed, Cuddle, Play, Nibble,
  Boom, Tuck in / Wake.
- **Event** — the persisted record of an action (who, what, when). The source of truth
  for shared state in phase 2.
