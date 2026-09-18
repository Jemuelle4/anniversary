// All tunable numbers for Plush. See docs/data-model.md §2.
export const NEEDS = ["fullness", "fun", "love", "energy"];
export const NEED_ICONS = { fullness: "🍞", fun: "🎾", love: "💗", energy: "⚡" };
export const NEED_LABELS = { fullness: "Fullness", fun: "Fun", love: "Love", energy: "Energy" };
export const INITIAL_NEEDS = { fullness: 80, fun: 80, love: 80, energy: 100 };
export const RATES = {
  awake: { fullness: 4, fun: 3, love: 2, energy: 3 },
  asleep: { fullness: 2, fun: 1, love: 1, energy: -15 },
};
export const DECAY_FLOOR = 10;
export const MIN_SLEEP_MS = 30 * 60_000;
export const MAX_BITES = 20;
export const BOOM_COOLDOWN_MS = 60_000;
export const MOOD_WEIGHTS = { fullness: 0.30, fun: 0.30, love: 0.25, energy: 0.15 };
export const MOOD_THRESHOLDS = { ecstatic: 85, happy: 65, okay: 45, meh: 25 };
export const THOUGHT_BELOW = 40;

export const CARE_POINTS = { feed: 3, cuddle: 3, play: 3, sleep: 2, nibble: 1, boom: 1, wake: 0 };
export const DAILY_POINT_CAP = 30;
export const POINTS_MIN_DELTA = 5;
export const LEVEL_THRESHOLDS = [0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100];
export const LEVEL_TITLES = ["Newborn", "Little", "Cosy", "Bright", "Bold", "Beloved", "Radiant", "Legendary", "Mythic", "Forever"];
export const STREAK_MILESTONES = [7, 30, 100, 365];
// Ritual windows in home-local hours. The "ritual day" rolls over at 03:00 so a goodnight
// after midnight belongs to the evening it started (docs/phase-3 §3).
export const RITUAL_DAY_START_HOUR = 3;
export const RITUAL_WINDOWS = {
  breakfast: { action: "feed", hours: [[5, 12]] },
  playtime: { action: "play", hours: null },
  goodnight: { action: "sleep", hours: [[20, 24], [0, 3]] },
};
export const RITUAL_ORDER = ["breakfast", "playtime", "goodnight"];

export const SCHEMA_VERSION = 3;
export const PARTNER_COLORS = ["rose", "amber", "mint", "sky", "lilac", "beige"];
