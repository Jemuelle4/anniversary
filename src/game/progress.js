import { CARE_POINTS, DAILY_POINT_CAP, LEVEL_THRESHOLDS, LEVEL_TITLES, NEEDS, POINTS_MIN_DELTA, RITUAL_ORDER, RITUAL_WINDOWS, STREAK_MILESTONES } from "./constants.js";
import { addDays, hourIn, isoWeek, ritualDayKey } from "./time.js";

export function levelFor(points) {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (points >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  return Math.min(lvl, LEVEL_THRESHOLDS.length);
}
export function levelTitle(level) { return LEVEL_TITLES[Math.max(1, Math.min(10, level)) - 1]; }
export function levelProgress(points) {
  const lvl = levelFor(points);
  if (lvl >= LEVEL_THRESHOLDS.length) return 1;
  const lo = LEVEL_THRESHOLDS[lvl - 1], hi = LEVEL_THRESHOLDS[lvl];
  return Math.max(0, Math.min(1, (points - lo) / (hi - lo)));
}

/** Resets per-day fields when the ritual day changed. Mutates and returns state. */
export function rolloverIfNeeded(state, now, tz) {
  const today = ritualDayKey(now, tz);
  const p = state.progress;
  if (p.today === today) return state;
  p.today = today;
  p.dailyPoints = {};
  p.rituals = { breakfast: null, playtime: null, goodnight: null };
  return state;
}

/** Award care points for an action if it moved a need enough. Mutates; returns effects. */
export function awardPoints(state, type, needsBefore, partnerId) {
  const effects = [];
  const moved = NEEDS.some((n) => Math.abs(state.needs[n] - needsBefore[n]) >= POINTS_MIN_DELTA);
  const base = CARE_POINTS[type] ?? 0;
  if (!moved || base === 0) return effects;
  const p = state.progress;
  const who = partnerId ?? "local";
  const used = p.dailyPoints[who] ?? 0;
  const grant = Math.max(0, Math.min(base, DAILY_POINT_CAP - used));
  if (grant === 0) return effects;
  p.dailyPoints[who] = used + grant;
  p.carePoints += grant;
  const lvl = levelFor(p.carePoints);
  if (lvl > p.level) { p.level = lvl; effects.push("celebrate:level"); }
  return effects;
}

function inWindow(hour, hours) {
  if (!hours) return true;
  return hours.some(([a, b]) => hour >= a && hour < b);
}

/** Mark a ritual complete if this action qualifies. Mutates; returns effects. */
export function applyRituals(state, type, now, tz, partnerId) {
  const effects = [];
  const p = state.progress;
  const hour = hourIn(now, tz);
  for (const name of RITUAL_ORDER) {
    const w = RITUAL_WINDOWS[name];
    if (w.action !== type || p.rituals[name] || !inWindow(hour, w.hours)) continue;
    p.rituals[name] = { by: partnerId ?? null, at: now };
    effects.push(`ritual:${name}`);
    if (RITUAL_ORDER.every((r) => p.rituals[r])) effects.push(...completeFullDay(state));
  }
  return effects;
}

function completeFullDay(state) {
  const p = state.progress;
  const D = p.today;
  const s = p.streak;
  const effects = [];
  if (s.lastFullDay === D) return effects;
  const week = isoWeek(D);
  if (s.lastFullDay === addDays(D, -1)) s.count += 1;
  else if (s.lastFullDay === addDays(D, -2) && s.freezeUsedWeek !== week) { s.count += 1; s.freezeUsedWeek = week; effects.push("toast:streak.freeze"); }
  else s.count = 1;
  s.lastFullDay = D;
  effects.push("fullday");
  if (STREAK_MILESTONES.includes(s.count)) effects.push("celebrate:streak");
  return effects;
}
