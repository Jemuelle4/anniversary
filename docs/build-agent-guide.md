# Build agent guide

Status: **done**. Read this before implementing any phase.

## 1. Reading order

1. `docs/STATUS.md` (what exists, what is in progress)
2. `docs/product-brief.md`
3. `docs/architecture.md` and `docs/data-model.md`
4. `docs/testing-strategy.md`
5. The phase doc you are implementing, then `docs/ui-spec.md` for visuals.

Phases are implemented in order; do not start phase N+1 until phase N's acceptance
checklist is ticked in its doc (edit the checkboxes in the phase doc and commit).

## 2. Ground rules

- **No bundler, no framework, no dependencies.** ES modules only. `package.json` exists
  for scripts (`test`, `test:db`, `serve`) and `"type": "module"`; it must never gain a
  `dependencies` or `devDependencies` block.
- **Serve, don't open.** ES modules need http. `python3 -m http.server 8000` or
  `npx serve .`. Update `CLAUDE.md` to say this in phase 1.
- **The gift is sacred.** `index.html`'s look, the two photos, the headline, the
  "Surprise!" button, and the "Click!" label reveal on the dock stay. `actions.html`
  remains a working stateless playground.
- **Pure game logic.** Nothing under `src/game/` or `src/store/localStore.js` may reference
  `window`, `document`, `setTimeout`, `fetch`, or `Math.random` (seed creation excepted
  and injectable). Tests enforce this by importing those modules in Node.
- **Tests before UI.** For each phase, write the `node --test` suites listed in the phase
  doc first, make them pass, then build the UI.
- **Spec conflicts.** If two docs disagree, `data-model.md` wins on schema, the phase doc
  wins on behaviour detail, `architecture.md` wins on layering. Record the resolution as a
  one-line note at the top of the doc you overrode, and mention it in `STATUS.md`.
- **Unknowns.** If a spec is silent, pick the simplest option that keeps the product
  principles, note it under an "Implementation notes" heading at the bottom of the phase
  doc, and continue. Do not stop to ask.
- **Keep secrets out.** Only the Supabase anon key and URL go in `config.js`. Service role
  and VAPID private keys live in Supabase function secrets.

## 3. Repository layout after all phases

```
index.html  surprise.html  actions.html  memories.html
app.js  config.js  sw.js  manifest.webmanifest  vercel.json
styles.css  plush.png  icons/  photos/
src/game/  src/store/  src/sync/  src/ui/  src/pet.js
tests/            node --test suites + tests/fixtures/decay-vectors.json
tests/db/         SQLite harness: schema.sql, localDb.js (RPC reference), rpc.test.js
tests/supabase/   deferred Tier C integration tests (skip without SUPABASE_URL)
supabase/migrations/0001_plush_homes.sql  0002_memories.sql  0003_push.sql
supabase/functions/nudge/index.ts
docs/
```

## 4. Commands

```
npm run serve      # python3 -m http.server 8000 → http://localhost:8000/
npm test           # all node --test suites: tests/**/*.test.js (Node 22.13+)
npm run test:db    # only the SQLite DB harness in tests/db/
npm run e2e        # headless Chromium scenarios (local + two-device via fake Supabase)
```

Test tiers and what is deferred until Supabase is available: `docs/testing-strategy.md`.

Applying migrations: paste each file from `supabase/migrations/` into the Supabase SQL
editor in order, or use Supabase tooling (`supabase db push` with the CLI, or the
Supabase MCP `apply_migration` tool if the session has it). Record which migrations are
applied to which project in `CLAUDE.md`.

Deploying the reminder function: `supabase functions deploy nudge` with secrets
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and the service role key
provided automatically. Schedule per phase 4 section 3.

## 5. Definition of done (per phase)

- All `node --test` suites in the phase doc exist and pass.
- The phase's acceptance checklist is ticked in the doc, with a one-line note for any
  item that could not be verified in the environment (for example, real phones).
- `CLAUDE.md` updated: module map, commands, migrations applied, SW version rule (phase 4).
- `docs/STATUS.md` updated: implementation status per phase, known gaps, next step.
- Committed and pushed on the designated branch with clear messages, one commit per
  coherent step (tests, logic, UI, docs), not one giant commit.

## 6. Manual verification aids

- Simulate time: in devtools, `localStorage['plush.v1.state']` (phase 1) or the
  `plush_state.state` row (phase 2+) → set `updatedAt` back by N hours and reload.
- Simulate a partner: a second browser profile or private window is a second anonymous
  user; join with the code and a different name.
- Simulate offline: devtools Network → Offline; actions must queue and flush.
- Simulate anniversary: set `anniversary_date` to today's date in the home's timezone.

## 7. Things not to do

- Do not add a build step, TypeScript compilation, or a CSS preprocessor.
- Do not port game rules to SQL or Deno beyond the ≤20-line decay copy in `nudge`.
- Do not add client-side writes to tables other than `push_subscriptions`.
- Do not introduce a "who cares more" scoreboard or any pet death state.
- Do not change animation timings from the originals unless a spec says so.
