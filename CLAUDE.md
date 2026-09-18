# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Plush: a shared, persistent virtual pet that grew out of a static anniversary page. Plain
HTML/CSS/JS with ES modules, **no bundler and no dependencies**. The only runtime dependency
is `@supabase/supabase-js` loaded from esm.sh when a Supabase project is configured.

- Run: `npm run serve` (python http.server on :8000) and open `http://localhost:8000/`.
  ES modules do not load over `file://`, so always serve the directory.
- Unit tests: `npm test` (Node 22.13+, built-in runner, `tests/**/*.test.js`).
- DB harness only: `npm run test:db` (SQLite mirror of the Postgres schema and RPCs).
- Browser end-to-end: `npm run e2e` (headless Chromium via DevTools protocol; expects a
  Chromium binary at `/opt/pw-browsers/chromium` or `$CHROMIUM`).

Design docs and specs live in `docs/` (start at `docs/STATUS.md`).

## Modes

`src/pet.js` picks a store at boot: with `config.js` filled in it uses Supabase (shared
between the two partners); with an empty config or `?local=1` it uses `localStorage`
(single device). Everything else is identical.

## Pages

- `index.html` — the original anniversary landing (photos + "Surprise!"). Kept as the gift.
  Only change: the year number follows the home's anniversary date when one is cached.
- `surprise.html` — **Plush**. Top bar, HUD (meters, mood, level, rituals), stage, 3×2 dock.
- `actions.html` — Playground: the original stateless sandbox, nothing here counts.
- `memories.html` — journal of auto milestones and manual moments.

## Layout

```
app.js                  entry; picks the page by <body data-page>; registers sw.js
config.js               public Supabase URL/anon key, SITE_URL, VAPID public key (empty = local mode)
src/game/               pure rules, no DOM/timers/network: constants, state (create/migrate/validate),
                        decay (lazy, timestamp based), actions (six actions + effectsFor), mood,
                        bites (seeded spiral mask), progress (points/levels/rituals/streaks), time (tz days), copy
src/store/              Store contract; LocalStore (localStorage); SupabaseStore (RPC-only writes, Realtime)
src/sync/               outbox reducer (rebase on version conflicts), Syncer flush loop, clock offset, CDN client
src/ui/                 stage (animations ported from the original app.js), hud, dock, toast, sheet,
                        pairing, feed, settings, menu, moments, photo resize, push
src/pet.js              Plush page controller; src/memories.js; src/playground.js
sw.js, manifest.webmanifest, icons/   PWA (bump SW_VERSION in sw.js on every deploy)
supabase/migrations/    0001 homes+RPCs, 0002 memories+storage, 0003 push subscriptions
supabase/functions/nudge  hourly web-push reminder (Deno); decay.ts is pinned to tests/fixtures/decay-vectors.json
tests/                  unit tests; tests/db = SQLite harness; tests/e2e = browser scenarios + fake Supabase
vercel.json             static hosting headers
```

## Rules

- Keep game arithmetic in `src/game/**` only; UI renders state and dispatches actions.
- Every state write goes through `applyAction` → `store.commit`; the Supabase side is a
  compare-and-swap RPC (`commit_action`), and the client rebases on `version` conflicts.
- Keep `tests/db/schema.sql` and `tests/db/localDb.js` in lock-step with the migrations;
  `tests/rpcSignatures.test.js` checks RPC names/params statically.
- Never add a build step, TypeScript compilation for the app, or npm dependencies.
- The landing page's look and the "Click!" label reveal are part of the original gift; keep them.

## Supabase setup (when a project is available)

1. Apply `supabase/migrations/0001..0003` in order (SQL editor, CLI, or MCP tooling).
2. Fill `config.js` with the project URL and anon key (and `SITE_URL`).
3. Optional reminders: generate VAPID keys, set function secrets, deploy `nudge`, schedule hourly
   (see the comment in `0003_push.sql`), put the public key in `config.js`.
4. Run the deferred integration tests in `docs/testing-strategy.md` §5 (Tier C) — none exist yet.
