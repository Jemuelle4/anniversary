import { BOOM_COOLDOWN_MS, MAX_BITES, MIN_SLEEP_MS, NEEDS } from "./constants.js";
import { applyDecay, normalize } from "./decay.js";
import { applyRituals, awardPoints } from "./progress.js";
import { randomSeed } from "./rng.js";
import { clampNeed } from "./state.js";

export const ACTIONS = [
  { type: "feed", label: "Feed", emoji: "🍞" },
  { type: "cuddle", label: "Cuddle", emoji: "💗" },
  { type: "play", label: "Play", emoji: "🎾" },
  { type: "nibble", label: "Nibble", emoji: "😬" },
  { type: "boom", label: "Boom", emoji: "💥" },
  { type: "sleep", label: "Sleep", emoji: "💤", awakeLabel: "Sleep", asleepLabel: "Wake" },
];
export const ACTION_TYPES = ["feed", "cuddle", "play", "nibble", "boom", "sleep", "wake"];

export function canApply(state, type, now) {
  if (type === "wake") return state.asleep ? { ok: true } : { ok: false, reason: "awake" };
  if (state.asleep) return { ok: false, reason: "asleep" };
  switch (type) {
    case "feed": return state.needs.fullness >= 95 ? { ok: false, reason: "stuffed" } : { ok: true };
    case "play": return state.needs.energy < 15 ? { ok: false, reason: "tooTired" } : { ok: true };
    case "boom":
      if (state.needs.energy < 20) return { ok: false, reason: "tooTired" };
      if (now < (state.cooldowns.boom ?? 0)) return { ok: false, reason: "cooldown" };
      return { ok: true };
    case "cuddle": case "nibble": case "sleep": return { ok: true };
    default: return { ok: false, reason: "unknown" };
  }
}

function bump(state, need, delta) { state.needs[need] = clampNeed(state.needs[need] + delta); }

/**
 * Apply an action. Always applies decay first. Returns
 *   { ok: true,  state, effects }  or  { ok: false, reason, state, effects }.
 * ctx: { partnerId, timezone, seed (respawn seed override), autoWake: bool }
 */
export function applyAction(input, type, now, ctx = {}) {
  const state = applyDecay(input, now, ctx);
  const effects = [];
  if (state.autoWoke) { effects.push("anim:wake"); delete state.autoWoke; }
  const check = canApply(state, type, now);
  if (!check.ok) {
    return { ok: false, reason: check.reason, state: normalize(state), effects: [...effects, `toast:${type}.${check.reason}`] };
  }
  const before = { ...state.needs };
  switch (type) {
    case "feed":
      bump(state, "fullness", 30); bump(state, "fun", 5);
      effects.push("anim:feed", "toast:feed.ok"); break;
    case "cuddle":
      bump(state, "love", 25); bump(state, "fun", 5);
      state.bites.count = Math.max(0, state.bites.count - 5);
      effects.push("anim:cuddle", "toast:cuddle.ok"); break;
    case "play":
      bump(state, "fun", 25); bump(state, "energy", -10); bump(state, "fullness", -5);
      effects.push("anim:play", "toast:play.ok"); break;
    case "nibble":
      bump(state, "fun", 8); bump(state, "love", -3);
      state.bites.count += 1;
      effects.push("anim:nibble");
      if (state.bites.count >= MAX_BITES) {
        state.bites = { seed: ctx.seed ?? randomSeed(), count: 0 };
        state.counters.eaten += 1;
        bump(state, "love", -10); bump(state, "fun", 15);
        effects.push("bites:respawn", "toast:nibble.eaten");
      } else effects.push("toast:nibble.ok");
      break;
    case "boom":
      bump(state, "fun", 15); bump(state, "energy", -15);
      state.bites.count = 0;
      state.cooldowns.boom = now + BOOM_COOLDOWN_MS;
      effects.push("anim:boom", "toast:boom.ok"); break;
    case "sleep":
      state.asleep = true; state.sleepStartedAt = now;
      effects.push("anim:sleep", "toast:sleep.ok"); break;
    case "wake": {
      const slept = now - (state.sleepStartedAt ?? now);
      state.asleep = false; state.sleepStartedAt = null;
      if (slept < MIN_SLEEP_MS) { bump(state, "fun", -5); effects.push("anim:wake", "toast:wake.grumpy"); }
      else { bump(state, "fun", 5); effects.push("anim:wake", "toast:wake.rested"); }
      break;
    }
  }
  state.lastAction = { type, at: now, by: ctx.partnerId ?? null };
  state.counters[type] = (state.counters[type] ?? 0) + 1;
  if (ctx.timezone) {
    effects.push(...awardPoints(state, type, before, ctx.partnerId));
    effects.push(...applyRituals(state, type, now, ctx.timezone, ctx.partnerId));
  }
  return { ok: true, state: normalize(state), effects };
}

/** Effect tags for a remote event row, derived from type/payload and the state diff. */
export function effectsFor(prevState, row) {
  const effects = [];
  const type = row.type;
  const after = row.state_after;
  if (ACTION_TYPES.includes(type)) effects.push(`anim:${type}`);
  if (type === "nibble" && row.payload?.seed != null) effects.push("bites:respawn");
  if (prevState && after?.progress) {
    if ((after.progress.level ?? 1) > (prevState.progress?.level ?? 1)) effects.push("celebrate:level");
    const prevS = prevState.progress?.streak?.count ?? 0, nextS = after.progress.streak?.count ?? 0;
    if (nextS > prevS && [7, 30, 100, 365].includes(nextS)) effects.push("celebrate:streak");
    for (const r of ["breakfast", "playtime", "goodnight"]) if (after.progress.rituals?.[r] && !prevState.progress?.rituals?.[r]) effects.push(`ritual:${r}`);
  }
  return effects;
}

export { NEEDS };
