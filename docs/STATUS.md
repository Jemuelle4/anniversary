# Plush — design & spec session status

This file is the checkpoint for the one-shot design session. It is updated after every
doc that is finished or left in progress. If you are a build agent, read this first,
then `product-brief.md`, then the phase doc you were asked to implement.

## Session facts

- Branch: `claude/plush-product-design-specs-evdga9`
- Session date: 2026-09-18
- Role of this session: product design + implementation-ready technical specs only.
  **No application code is written in this session.** Build agents implement later.
- Note: the repo's `CLAUDE.md` describes only the current static anniversary app. It does
  not contain a docs layout or a one-shot session rule set, so the layout below was chosen
  in this session and is the canonical one for build agents.

## Docs layout (canonical)

| File | Purpose | Status |
|---|---|---|
| `docs/STATUS.md` | This checkpoint file | live |
| `docs/product-brief.md` | What Plush is, who it is for, principles, scope, phasing | done |
| `docs/phase-1-core-loop.md` | Single-device pet loop: needs, actions, decay, moods, local persistence, tests | done |
| `docs/phase-2-shared-sync.md` | Two-person shared state: Supabase schema, event log, realtime, offline queue, pairing | pending |
| `docs/phase-3-growth-and-memories.md` | Levels, streaks, rituals, memory journal, milestone celebrations | pending |
| `docs/phase-4-polish-and-launch.md` | PWA, notifications, accessibility, error states, deploy to Vercel, launch checklist | pending |
| `docs/architecture.md` | Cross-phase system overview, module layout, store adapter contract | pending |
| `docs/data-model.md` | Canonical state schema and event catalogue across all phases | pending |
| `docs/ui-spec.md` | Screens, layout, dock, stage, expression system, reuse of existing CSS animations | pending |
| `docs/build-agent-guide.md` | Conventions for implementers: no build step, ES modules, `node --test`, acceptance checks, commit rules | pending |

Status values: `pending` (not started), `in progress` (partially written, see note), `done`.

## Progress log

- [x] Read existing app (`index.html`, `surprise.html`, `actions.html`, `app.js`, `styles.css`).
- [x] `docs/STATUS.md` created.
- [x] `docs/product-brief.md` written.
- [x] `docs/phase-1-core-loop.md`
- [ ] `docs/phase-2-shared-sync.md`
- [ ] `docs/phase-3-growth-and-memories.md`
- [ ] `docs/phase-4-polish-and-launch.md`
- [ ] `docs/architecture.md`
- [ ] `docs/data-model.md`
- [ ] `docs/ui-spec.md`
- [ ] `docs/build-agent-guide.md`

## In-progress notes / next step

Next: write `docs/phase-2-shared-sync.md`.

## Decisions made so far (summary; details live in the docs)

1. Plush is one shared pet for exactly two people (the couple). Not multiplayer beyond that.
2. Stack stays plain HTML/CSS/JS with no bundler. ES modules served by a static server.
   Supabase (Postgres + Realtime + anonymous auth) for shared persistence from phase 2.
   Vercel for hosting from phase 4 (any static host works).
3. Phase 1 is fully playable on one device with `localStorage`, behind a `Store`
   interface so phase 2 swaps in Supabase without touching game logic.
4. The four existing animations (throw, bite, explode, cuddle) are kept and given
   game meaning; two care actions (feed, tuck in) are added.
5. Pure game logic lives in DOM-free modules tested with `node --test`.
