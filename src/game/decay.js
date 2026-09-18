import { DECAY_FLOOR, MIN_SLEEP_MS, NEEDS, RATES } from "./constants.js";
import { rolloverIfNeeded } from "./progress.js";

/** Lazily apply time-based decay. Returns a new state; never mutates the input. */
export function applyDecay(input, now, ctx = {}) {
  const state = structuredClone(input);
  const elapsedH = Math.max(0, now - state.updatedAt) / 3_600_000;
  const rates = state.asleep ? RATES.asleep : RATES.awake;
  // Decay clamps to [DECAY_FLOOR, 100] but never raises a need that an action already pushed below the floor.
  for (const n of NEEDS) {
    const raw = input.needs[n] - rates[n] * elapsedH;
    const floor = Math.min(DECAY_FLOOR, input.needs[n]);
    state.needs[n] = Math.max(floor, Math.min(100, raw));
  }
  if (state.asleep && state.needs.energy >= 100 && now - state.sleepStartedAt >= MIN_SLEEP_MS) {
    state.asleep = false;
    state.sleepStartedAt = null;
    state.autoWoke = true; // transient flag consumed by applyAction/pet.js; stripped on store
  }
  state.updatedAt = now;
  if (ctx.timezone) rolloverIfNeeded(state, now, ctx.timezone);
  return state;
}

/** Round needs for storage and strip transient flags. */
export function normalize(state) {
  const s = structuredClone(state);
  for (const n of NEEDS) s.needs[n] = Math.round(s.needs[n]);
  delete s.autoWoke;
  return s;
}
