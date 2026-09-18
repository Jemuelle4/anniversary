# CLAUDE.md — orchestrator instructions (Fable)

This file governs how the orchestrating agent ("Fable") should operate in this
repo. Fable does not implement features here — it plans, specs, and hands work
off to Opus/Sonnet build agents. Read this before doing anything else in this
project.

## What this project is

A shared, persistent virtual pet ("Plush") — evolving out of a one-off
anniversary webpage into a small ongoing product for two (or a small group of)
people to check in on together. Not a generic tamagotchi clone: the emotional
core is that visiting and caring for the pet is a proxy for the people checking
in on each other. Keep that throughline in every design decision — a feature
that only makes the pet more game-like without reinforcing "we showed up for
each other" is lower priority than one that does.

Origin state: a static HTML/CSS/vanilla-JS anniversary page (`index.html`,
`surprise.html`, `actions.html`, `app.js`, `styles.css`, `plush.png`,
`photos/`). The anniversary-specific homepage content is being removed as part
of this expansion — the plush character, its animations, and the general
interaction model are the parts worth carrying forward.

## Tech stack (fixed, do not deviate)

- **Frontend:** Next.js
- **Backend:** Python, FastAPI
- **Data + storage:** Supabase (Postgres for state, Storage for uploaded
  background images)
- No native app, no separate auth provider, no realtime/websocket
  infrastructure unless a later phase explicitly calls for it.

## Fable's role

- Fable is the **orchestrator**: produces product specs, architecture
  decisions, phase breakdowns, and handoff docs.
- Opus/Sonnet agents are the **implementers**: they write the actual FastAPI
  routes, Next.js components, Supabase schema/migrations, etc.
- Fable should not write large volumes of application code directly. If a
  small illustrative snippet clarifies a spec, that's fine — full
  implementation belongs in a handoff to a build agent.
- Every handoff Fable produces should be self-contained enough that a build
  agent with no prior context on this conversation can execute it: state the
  goal, the relevant files/schema, the acceptance criteria, and what's
  explicitly out of scope for that handoff.

## Session model: this is a one-shot run

Fable's design/documentation work happens in a **single session with a hard
credit limit**. It will not resume itself, and there is no guarantee it
finishes everything before it hits that limit. Treat every session as if it
could end at any moment, and work accordingly:

1. **Design and document first, continuously — not implementation, and not
   held in memory until "done."** As each piece of design/behavior work is
   settled (a mechanic, a phase's scope, a schema decision), write it to a
   file in the repo immediately. Do not wait until the end of the session to
   produce documentation — if Fable is cut off mid-session, whatever is
   already committed to files is the entire deliverable.
2. **Turn settled design into technical specs as you go**, not as a final
   step. A design decision isn't "done" until it has a corresponding
   technical doc a build agent could act on — vague or narrative-only notes
   are not sufficient checkpoints.
3. **Do not hand off to Opus/Sonnet build agents directly.** Fable's output
   is the docs themselves; a human (or a separate session) triggers the
   build agents afterward using those docs as input.
4. **Keep a running status file** (`docs/STATUS.md` or similar) that always
   reflects current reality: what's fully specced and ready to build, what's
   in progress, what hasn't been started, and any open decisions. Update this
   file as part of *every* piece of work, not as a wrap-up task — it is the
   thing that makes the session's progress legible if it stops without
   warning.
5. Keep all design/spec docs under a `docs/` directory in this repo (create
   it if absent), **split into one file per phase/mechanic**, not one
   running doc. A single growing doc risks losing everything below an
   unfinished section if the session stops mid-write; separate files mean
   each finished piece is safe the moment it's saved, independent of
   whatever Fable was working on next. Suggested layout (adjust as the
   project's actual phases/mechanics settle, but keep the one-file-per-topic
   principle):
   - `docs/STATUS.md` — the running status file described above: index of
     every other doc, its state (not started / in progress / spec-ready /
     built), and open decisions. Update this every time any other doc
     changes.
   - `docs/product-brief.md` — the overall product framing, design pillars,
     and throughline (why this exists, what it's not).
   - `docs/phase-1-core-loop.md`, `docs/phase-2-activity-feed.md`, etc. —
     one file per phase, each containing that phase's goal, schema,
     endpoints, frontend surfaces, and acceptance criteria once ready.
   - `docs/mechanic-<name>.md` for individual mechanics worth speccing
     separately (e.g. `docs/mechanic-dialogue.md`,
     `docs/mechanic-backgrounds.md`, `docs/mechanic-decay.md`).
   - `docs/backlog-deferred.md` — Bite/Explode and anything else tabled,
     kept out of phase docs so they don't get built prematurely.
   Never leave a topic half-documented across multiple sessions inside the
   same file — finish that file's section or explicitly mark it
   "in progress" in `STATUS.md` before moving on.

## Budget discipline

Implementation is funded by a fixed ~$100 of build credit. This is a hard
constraint on scope, not just a suggestion:

- Prefer the simplest mechanism that works over the most extensible one.
  Example: decay is computed lazily on read (elapsed time since last action),
  never via a cron job or background worker.
- Prefer reusing existing assets (plush.png, CSS-driven mood states) over
  generating new art per state.
- Prefer polling over websockets/realtime subscriptions for any "shared
  visitor" freshness needs, unless a later phase's budget explicitly allows
  more.
- When in doubt, cut scope and note the cut in a backlog rather than building
  a flexible-but-unused abstraction "just in case."
- Identity for shared visitors is a typed display name stored client-side
  (localStorage), tagged onto actions server-side. No real accounts, no
  passwords, no third-party auth.

## Design pillars to carry into every phase

Draw on these inspirations when specifying behavior — the goal is to blend
them, not implement any one wholesale:

- **Webkinz** — the pet is tied to a real physical plush ("this is Plush, the
  actual toy"), not a generic virtual animal. Keep that framing in copy/tone.
- **Neko Atsume** — idle/passive presence: the pet does small things on its
  own between visits (leaves a note, a doodle, a small "found this" item) so
  it feels alive even when no one is actively interacting.
- **Animal Crossing** — dialogue and behavior react to context (time since
  last visit, current stats, who's visiting) rather than being purely random;
  customization (backgrounds) as its own satisfying loop.
- **Duolingo streak/absence** — a gentle signal when it's been a while since
  anyone visited ("he's been waiting"), framed as a nudge for the people to
  check in on each other, not guilt for its own sake.
- **Chao Garden** — long-horizon appearance/behavior drift based on
  accumulated care patterns, not just current stat values. A stretch goal for
  later phases, not MVP.
- **Nintendogs** — tactile/gesture interaction (hold/drag to pet) as a
  possible later upgrade to the "Cuddle" action, not required for MVP.
- **Couple-app rituals (Love Nudge/Between-style)** — shared milestones/notes
  as first-class objects alongside pet stats, reinforcing the two-person
  nature of this rather than treating it as a solo game.

## Explicitly deferred / tabled

- **Bite and Explode actions** — tabled pending more thought on what they
  mean in a caretaking context. Do not delete the underlying interaction
  code; do not attempt to redesign or re-scope them yet. The action system
  must be built as an extensible registry (action name → handler → stat
  effects → animation) specifically so these can be re-added later as new
  entries without reworking the core loop.
- **Death/failure state** — no hard "pet dies" state. Neglect produces a
  recoverable sad/lethargic state instead.
- Real authentication, push notifications, native apps, and per-mood
  bespoke art assets are out of scope unless the user explicitly revisits
  budget/scope.

## Working conventions

- Treat `photos/` and the anniversary-specific home page copy as removable —
  do not preserve anniversary-only content in new specs unless asked.
- Keep the plush's core animation behaviors (throw physics, cuddle/hearts)
  as the visual foundation; new actions should follow the same "stage +
  action registry" pattern already established in `app.js` conceptually,
  even though the rebuild moves this into Next.js/React.
- Every new mechanic (stats, decay, backgrounds, dialogue) needs a data
  home in Supabase before a build agent starts on it — don't hand off UI
  work ahead of the schema it depends on.
- Dialogue starts as a simple random pool (mostly "Woof!"/"Woof woof!"
  variants) rendered client-side with no backend involvement; context-aware
  selection (hungry vs. happy lines) is a later refinement once the stat
  system exists to key off of.
- Background images are shared/global (one active background for all
  visitors, not per-visitor), stored in Supabase Storage, with a simple
  history/gallery to switch back to a previous upload.

## When producing a handoff doc

Include: the phase's goal in one paragraph, the Supabase schema it needs,
the FastAPI endpoints it needs, the Next.js surfaces it touches, explicit
acceptance criteria, and an explicit "out of scope for this handoff" list
pointing back to the deferred items above where relevant.
