# UI spec

Status: **done**. Visual and interaction reference for all phases. Phone-first.

## 1. Design tokens (extend `styles.css :root`)

Existing: `--bg-dark #1f1f1f`, `--accent #ff8a00`, `--btn #0a84ff`, beige trio
`--beige #d8c3a5 / --beige-2 #e7d7c1 / --beige-3 #bfa98a`, glass `--glass-*`.

Add:

```
--meter-good: var(--beige);   --meter-mid: var(--accent);   --meter-low: #ff5a5a;
--text-dim: rgba(255,255,255,.62);
--partner-rose:#ff8fab; --partner-amber:#ffc46b; --partner-mint:#8fe3c0;
--partner-sky:#8ec5ff;  --partner-lilac:#c9a7ff; --partner-beige:#d8c3a5;
--radius-pill: 999px; --radius-card: 18px;
```

Type: system sans (unchanged). Headline weight 900 on the landing only; in-app labels
weight 700–800; body 500.

## 2. Screens

### Landing (`index.html`) — unchanged look
Two photos, the big amber headline, the blue "Surprise!" pill. Phase 3 may update the
year number; phase 4 adds the manifest link. Nothing else changes; this is the gift.

### Plush (`surprise.html`)

Vertical stack, dark variant:

1. **Top bar** (glass, 48 px): Back pill left; right: presence pill (phase 2) and a
   menu button "≡" opening the menu sheet.
2. **HUD** (glass card, absolutely positioned at the top of the stage, 12 px inset):
   - Row 1–2: 2×2 meters, each `icon  ████░░` with 8 px bars, `aria` per phase 4.
   - Row 3: mood line: `Happy · Sam fed Plush 2h ago` (dim text), second line in phase 3:
     `Lv 4 · Bright · 🔥 12` with a 3 px level bar.
   - Row 4 (phase 3): rituals `☑ Breakfast ☐ Playtime ☐ Goodnight`.
   - HUD collapses to a single mood line when the viewport height < 620 px; tapping it
     expands for 4 s.
3. **Stage**: existing `.stage`; the plush sits at `top: 56%` (moved from 52% to make room
   for the HUD). Thought bubble: glass pill 36 px above the sprite with one icon.
   Partner chip (phase 2): small pill with swatch + name that appears beside the sprite
   for 1.5 s on remote actions.
4. **Toast**: single glass pill centred 84 px above the dock, 1800 ms, fade 200 ms.
5. **Dock**: existing glass dock; Back pill removed from the dock (it is in the top bar);
   `.dock-actions` is a 3×2 grid of the existing outline buttons. Labels start as "Click!"
   and reveal on first tap (gift behaviour). Disabled look: opacity .5, no pointer
   change. Boom cooldown shows `Boom · 42s`. Sleep button shows "Wake" while asleep.

### Playground (`actions.html`) — unchanged behaviour
Original four buttons and sandbox. Add a small "Playground · nothing here counts" caption
in the top bar.

### Memories (`memories.html`, phase 3)
Light variant like the landing. Cards 100 % width on phones, 2 columns ≥ 720 px: photo
(4:3, rounded 18), caption, meta row (kind icon, swatch + name, date). "Add a moment"
floating pill bottom-right.

## 3. Sheets (in-page overlays)

Bottom sheets, glass on dark, 24 px top radius, drag handle, close on backdrop tap and
Esc, focus trapped. Max height 80 vh, scroll inside.

- **Menu**: Activity · Memories · Add a moment · Settings · Invite code · Playground ·
  Reset Plush (destructive, red text, confirm step inside the sheet).
- **Pairing** (phase 2 section 8): two-step; big monospace code display `PLUSH-4K7Q`
  with Share and Copy pills.
- **Activity**: list rows `swatch  Sam fed Plush   2h ago`, 30 rows, "Load more" when
  more exist (phase 3 uses paging on events too).
- **Settings**: fields per phase 4 section 6; save on change with a "Saved" toast.
- **Add a moment**: caption textarea (counter 0/140), photo picker with preview, Save.

## 4. Animation inventory

| Existing | Kept as | Notes |
|---|---|---|
| `popIn` | sprite spawn/respawn | unchanged |
| `shake` → `plushExplode` + `burst` + `particle` | Boom | plush pops back after 900 ms; burst+particles alone reused for celebrations |
| `chomp` + spiral mask | Nibble | mask from seeded geometry |
| `heartFloat` + `loveText` | Cuddle | unchanged |
| physics throw | Play | sprite carries bite mask; reduced-motion fallback fades to final spot |
| `fade-out` | respawn, throw cleanup | unchanged |

New keyframes: `foodDrop` (700 ms), `zz` (2400 ms loop, 3 staggered glyphs), `bob`
(1600 ms), `breathe` (3000/4000 ms), `tick` (240 ms), `hatBob` (2000 ms), `sparkle`
(900 ms). All are ≤ 3 properties (`transform`, `opacity`, `filter`) for smooth phones.

Mood classes on the sprite (`.plush.mood-*`) per phase 1 section 7; sleep dims; level
scale per phase 3 section 2. Only one of `.pop/.shake/.explode/.chomp` runs at a time;
mood idle animations are on a wrapper element so they never fight action keyframes.

## 5. Copy and tone

Short, warm, slightly deadpan. Plush is never sad *at* anyone. Refusals explain, never
scold ("Plush is too tired to play"). Partner names always appear where an action is
attributed. No exclamation marks except the gift's "Surprise!", "Wheee!", and
celebrations.

## 6. Responsive rules

- ≤ 360 px wide: meters stack 1×4, dock buttons `min-width` 0, font 14 px.
- ≥ 900 px: stage max-width 1100 px centred; dock max-width 560 px (existing).
- Safe areas: existing `env(safe-area-inset-*)` padding retained on top bar and dock.
- Landscape phones: HUD collapses to the one-line mode automatically.
