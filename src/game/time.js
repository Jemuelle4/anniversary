// Time-zone aware day helpers, pure, using Intl only.
import { RITUAL_DAY_START_HOUR } from "./constants.js";

const fmtCache = new Map();
function parts(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  const out = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = p.value;
  return out;
}

export function safeTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

/** YYYY-MM-DD of `ms` in `tz`. */
export function dayKey(ms, tz = "UTC") {
  const p = parts(ms, safeTz(tz));
  return `${p.year}-${p.month}-${p.day}`;
}
/** Local hour (0-23) of `ms` in `tz`. */
export function hourIn(ms, tz = "UTC") {
  return Number(parts(ms, safeTz(tz)).hour) % 24;
}
/** The "ritual day": local day, but the boundary is at 03:00 instead of midnight. */
export function ritualDayKey(ms, tz = "UTC") {
  return dayKey(ms - RITUAL_DAY_START_HOUR * 3_600_000, tz);
}
/** Add n days to a YYYY-MM-DD key. */
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** Whole days from key a to key b (b - a). */
export function diffDays(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
/** ISO week id "YYYY-Www" for a YYYY-MM-DD key. */
export function isoWeek(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
/** Human relative time, e.g. "just now", "5m ago", "2h ago", "3d ago". */
export function relativeTime(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
