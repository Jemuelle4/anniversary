# Phase 4 — Polish, reminders, and launch

Status: **done** (spec). Implementation: not started. Requires phases 1–3 (reminders
depend on phase 2 only; the rest can be built in parallel with phase 3).

## 1. Goal

Plush lives on both partners' home screens, nudges gently when it needs something, works
offline, is accessible, fails gracefully, and is deployed at a stable URL.

## 2. Installable PWA

- `manifest.webmanifest`: name "Plush", short_name "Plush", `start_url: /surprise.html`,
  `display: standalone`, `background_color: #1f1f1f`, `theme_color: #1f1f1f`, icons
  192/512 generated from `plush.png` on a dark rounded background (`icons/`), plus a
  maskable variant.
- `sw.js` (plain JS, no workbox): precache the app shell on install (`*.html`,
  `styles.css`, `app.js`, `src/**`, `plush.png`, icons, the Supabase client URL is **not**
  precached; let the browser cache it). Strategy: network-first for HTML and `config.js`,
  cache-first for everything else, with a versioned cache name bumped by a `SW_VERSION`
  constant that build agents must increment on each deploy. Photos in `photos/` are
  cache-first. Supabase API calls are never intercepted.
- Offline: the shell loads from cache; the store uses `plush.v2.cache` for the last
  snapshot and the outbox for actions (phase 2). A "Plush is offline" pill replaces the
  connection pill; the feed shows cached events.
- Update flow: when a new SW is waiting, show a toast "Plush has an update · Reload".
- Landing `index.html` links the manifest too so installing from the gift page works.

## 3. Reminders (Web Push)

The one server-side function in the product. Feature-flagged by the presence of a VAPID
public key in `config.js`; without it the UI hides reminders and nothing else changes.

Data (migration `0003_push.sql`):

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  home_id     uuid not null references homes(id) on delete cascade,
  partner_id  uuid not null references partners(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,                 -- { p256dh, auth }
  quiet_start smallint not null default 22,   -- home local hours, no pushes 22:00-08:00
  quiet_end   smallint not null default 8,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz
);
-- RLS: user can select/insert/delete own rows (direct table access is fine here; endpoint is per device)
```

Edge Function `nudge` (`supabase/functions/nudge/index.ts`, Deno):

1. Runs every hour via `pg_cron` calling the function over `pg_net`, or via the Supabase
   dashboard schedule; the schedule is documented in the migration as a comment, never
   assumed.
2. For each home with subscriptions: load `plush_state`, compute decayed needs with the
   **same arithmetic as `applyDecay`**, reimplemented in ≤20 lines in the function with a
   comment pointing at `src/game/decay.js` and a shared test vector in
   `tests/fixtures/decay-vectors.json` that both the JS test and a Deno test assert
   against. (This is the single, deliberate duplication in the product; the vector file
   keeps it honest.)
3. Nudge rule: lowest need < 30, not asleep, no push to this subscription in the last 8 h,
   current home-local hour outside the quiet window, and no event in the last 2 h.
4. Payload: `{ title: "Plush needs you", body: "<lowest need line>", url: "/surprise.html" }`
   with lines: "Plush is hungry" / "Plush is bored" / "Plush misses you" / "Plush is
   exhausted". If the partner acted since the recipient last opened, add "· <Name> was
   here <relative>".
5. Sends with the `web-push` library from esm.sh using VAPID keys stored as function
   secrets. 410/404 responses delete the subscription.

Client: menu → Settings → "Remind me" toggle → `Notification.requestPermission()`,
`registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
insert row. `sw.js` handles `push` (show notification) and `notificationclick` (focus or
open the URL).

Security note: the function uses the service role key from secrets to read all homes; it
never returns data to a client. Rate limit by construction (one run per hour, ≤1 push per
subscription per 8 h).

## 4. Accessibility

- Every button has a text label; the "Click!" reveal keeps `aria-label` set to the real
  action from the start so screen readers are not teased.
- Toasts and the mood line are in an `aria-live="polite"` region; celebrations use
  `aria-live="assertive"` once.
- Meters are `<meter>`-like: `role="meter"`, `aria-valuenow`, `aria-label="Fullness"`.
- Focus: the dock is keyboard reachable in dock order; sheets trap focus and close on Esc.
- `prefers-reduced-motion`: idle mood motions off, physics throw replaced by a 300 ms
  fade to its final position, particles limited to 6, hearts to 4.
- Contrast: meter colours and the beige text on dark pass 4.5:1; the amber `--accent`
  headline on the light landing is decorative and keeps its current look.
- Touch targets ≥ 44 px; the 3×2 dock keeps ≥ 10 px gaps.

## 5. Error and edge states

| Situation | Detection | UI |
|---|---|---|
| Supabase project paused (free tier idle) | fetch error with 5xx/`project paused` body on `home_snapshot` | Full-stage card "Plush is napping on the server" with Retry; local cache still shown dimmed. Prevention: the hourly `nudge` run keeps the project active. If reminders are not configured, one partner opening the app weekly is sufficient; say so in `CLAUDE.md`. |
| No network on first ever open | no cache, fetch fails | "Plush needs internet the first time" with Retry. |
| Anonymous session lost | `getSession()` null, no member | Pairing sheet with "Welcome back? Enter your code and the same name." |
| Invite code wrong / home full | RPC error codes | Inline errors (phase 2 copy). |
| Realtime disconnected > 30 s | channel status | Connection pill "reconnecting…"; polling fallback every 60 s while visible. |
| Photo too large / unsupported | client check before upload | "That file is too big (max 10 MB before resize)". |
| Clock skew rejected | `code:'clock'` twice | Toast "Your device clock is off; Plush used server time." |
| localStorage unavailable | try/catch on first write | Everything works in memory; a one-time toast "Private mode: Plush won't be remembered on this device". |

## 6. Settings (final list)

My name · my colour · home timezone · anniversary date · reminders (with quiet hours)
· invite code (show/share) · delete a memory (long-press on a card, confirm; RPC
`delete_memory(id)` removes row and storage object) · reset Plush · leave home
(confirm; deletes the member row; the pet stays for the other partner).

## 7. Performance and assets

- `photos/pic1.jpg` and `pic2.jpg` are ~620 KB each; add resized copies at 1200 px /
  ~150 KB and reference those, keeping originals out of the precache.
- `plush.png` (480×480, 156 KB) is fine; provide a 240 px `plush@1x.png` for
  `srcset` on small screens if Lighthouse flags it.
- Budget: first paint < 1.5 s on 4G, Lighthouse PWA and Accessibility ≥ 90.

## 8. Deployment (Vercel)

- Static project, no build command, output directory `.`; `vercel.json`:
  `cleanUrls: true`; headers: `Cache-Control: no-cache` for `*.html`, `sw.js`,
  `config.js`; `public, max-age=31536000, immutable` for `photos/*`, `icons/*`,
  `plush.png`; `Service-Worker-Allowed: /` for `sw.js`.
- Production URL is the one in the invite share text; set `SITE_URL` in `config.js`.
- Supabase: add the Vercel domain to Auth → URL configuration (redirect URLs are not
  needed for anonymous auth, but CORS is open by default; document anyway).
- Preview deployments point at the same Supabase project; a `?local=1` flag remains for
  backend-free checks.

## 9. Launch checklist

- [ ] Migrations 0001–0003 applied; RLS verified per phase 2 SQL checks.
- [ ] `config.js` has URL, anon key, site URL, optional VAPID public key.
- [ ] `node --test` green; Deno test for `nudge` green against the shared vector file.
- [ ] Lighthouse: PWA installable, Accessibility ≥ 90, Performance ≥ 85 on mobile.
- [ ] Two real phones: install, pair, feed on one, see it on the other, background both,
      receive one reminder after needs drop (simulate by SQL-updating `state`).
- [ ] Offline test on a phone: airplane mode, cuddle, back online, event lands.
- [ ] `CLAUDE.md` updated with SW version bump rule, deploy steps, and the migration list.
- [ ] The original gift path still works: open `/`, see the photos and headline, tap
      Surprise.

## 10. Assumptions

- Web Push on iOS requires the PWA to be installed to the home screen (iOS 16.4+); the
  settings toggle explains this when `navigator.standalone` is false on iOS.
- No analytics. If the couple ever wants to know usage, the events table already answers
  every question.
