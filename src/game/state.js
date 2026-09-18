import { INITIAL_NEEDS, NEEDS, SCHEMA_VERSION } from "./constants.js";
import { randomSeed } from "./rng.js";

export function clampNeed(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export function emptyProgress() {
  return {
    carePoints: 0, level: 1, today: null, dailyPoints: {},
    rituals: { breakfast: null, playtime: null, goodnight: null },
    streak: { count: 0, lastFullDay: null, freezeUsedWeek: null },
  };
}

export function createInitialState(now, seed = randomSeed()) {
  return {
    version: SCHEMA_VERSION,
    createdAt: now, updatedAt: now,
    needs: { ...INITIAL_NEEDS },
    asleep: false, sleepStartedAt: null,
    bites: { seed, count: 0 },
    cooldowns: { boom: 0 },
    lastAction: null,
    counters: { feed: 0, cuddle: 0, play: 0, nibble: 0, boom: 0, sleep: 0, wake: 0, eaten: 0 },
    progress: emptyProgress(),
  };
}

const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

/** Returns a valid current-version state from any input. Corrupt input -> fresh state. */
export function migrate(raw, now = Date.now()) {
  if (!isObj(raw) || !isObj(raw.needs)) return createInitialState(now);
  const base = createInitialState(now);
  const s = {
    ...base,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
    needs: { ...base.needs },
    asleep: raw.asleep === true,
    sleepStartedAt: raw.asleep === true && Number.isFinite(raw.sleepStartedAt) ? raw.sleepStartedAt : null,
    bites: { seed: Number.isInteger(raw.bites?.seed) ? raw.bites.seed : base.bites.seed, count: Number.isInteger(raw.bites?.count) ? Math.max(0, Math.min(20, raw.bites.count)) : 0 },
    cooldowns: { boom: Number.isFinite(raw.cooldowns?.boom) ? raw.cooldowns.boom : 0 },
    lastAction: isObj(raw.lastAction) && typeof raw.lastAction.type === "string" ? { type: raw.lastAction.type, at: Number(raw.lastAction.at) || now, by: raw.lastAction.by ?? null } : null,
    counters: { ...base.counters },
    progress: emptyProgress(),
  };
  for (const n of NEEDS) s.needs[n] = Math.round(clampNeed(Number(raw.needs[n] ?? base.needs[n])));
  if (isObj(raw.counters)) for (const k of Object.keys(s.counters)) if (Number.isInteger(raw.counters[k])) s.counters[k] = raw.counters[k];
  const p = raw.progress;
  if (isObj(p)) {
    s.progress.carePoints = Number.isInteger(p.carePoints) ? p.carePoints : 0;
    s.progress.level = Number.isInteger(p.level) ? Math.max(1, Math.min(10, p.level)) : 1;
    s.progress.today = typeof p.today === "string" ? p.today : null;
    s.progress.dailyPoints = isObj(p.dailyPoints) ? { ...p.dailyPoints } : {};
    if (isObj(p.rituals)) for (const r of Object.keys(s.progress.rituals)) s.progress.rituals[r] = isObj(p.rituals[r]) ? { by: p.rituals[r].by ?? null, at: Number(p.rituals[r].at) || 0 } : null;
    if (isObj(p.streak)) s.progress.streak = { count: Number.isInteger(p.streak.count) ? p.streak.count : 0, lastFullDay: p.streak.lastFullDay ?? null, freezeUsedWeek: p.streak.freezeUsedWeek ?? null };
  }
  return s;
}

/** Mirrors is_valid_state() in SQL (docs/data-model.md §1). */
export function isValidState(s) {
  if (!isObj(s) || s.version !== SCHEMA_VERSION || !isObj(s.needs)) return false;
  for (const n of NEEDS) { const v = s.needs[n]; if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return false; }
  if (typeof s.asleep !== "boolean") return false;
  const c = s.bites?.count;
  if (!Number.isInteger(c) || c < 0 || c > 20) return false;
  const lvl = s.progress?.level;
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 10) return false;
  return true;
}
