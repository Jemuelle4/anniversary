import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../src/game/actions.js";
import { applyDecay } from "../src/game/decay.js";
import { levelFor, levelProgress, levelTitle } from "../src/game/progress.js";
import { createInitialState } from "../src/game/state.js";

const TZ = "UTC";
const at = (iso) => Date.parse(iso);
const ctx = (partnerId = "a") => ({ partnerId, timezone: TZ });
const mid = (needs = {}) => ({ ...createInitialState(at("2026-09-18T12:00:00Z"), 1), needs: { fullness: 50, fun: 50, love: 50, energy: 50, ...needs } });

test("levels: thresholds, titles, progress fraction", () => {
  assert.equal(levelFor(0), 1); assert.equal(levelFor(29), 1); assert.equal(levelFor(30), 2);
  assert.equal(levelFor(2100), 10); assert.equal(levelFor(99999), 10);
  assert.equal(levelTitle(4), "Bright");
  assert.equal(levelProgress(55), 0.5); assert.equal(levelProgress(5000), 1);
});

test("points only when a need moved >= 5; nibble earns 1; daily cap per partner", () => {
  const t = at("2026-09-18T12:00:00Z");
  let s = applyAction(mid(), "feed", t, ctx()).state;
  assert.equal(s.progress.carePoints, 3);
  assert.equal(s.progress.dailyPoints.a, 3);
  s = applyAction(mid({ fullness: 94 }), "feed", t, ctx()).state;   // 94 -> 100 = 6 moved, fun +5
  assert.equal(s.progress.carePoints, 3);
  s = applyAction(mid({ fullness: 97 }), "cuddle", t, ctx()).state; // love +25 moved
  assert.equal(s.progress.carePoints, 3);
  const saturated = applyAction(mid({ fun: 100, love: 100 }), "cuddle", t, ctx());
  assert.equal(saturated.state.progress.carePoints, 0, "no need moved");
  s = applyAction(mid(), "nibble", t, ctx()).state;
  assert.equal(s.progress.carePoints, 1);
  // cap: 10 feeds from a partner can't exceed 30 while the other partner still earns
  s = mid();
  for (let i = 0; i < 12; i++) { s = applyAction({ ...s, needs: { ...s.needs, fullness: 50 } }, "feed", t + i, ctx("a")).state; }
  assert.equal(s.progress.dailyPoints.a, 30);
  assert.equal(s.progress.carePoints, 30);
  s = applyAction({ ...s, needs: { ...s.needs, fullness: 50 } }, "feed", t + 20, ctx("b")).state;
  assert.equal(s.progress.carePoints, 33);
});

test("level-up fires celebrate:level exactly once and never decreases", () => {
  let s = mid(); s.progress.carePoints = 28;
  const r = applyAction(s, "feed", at("2026-09-18T12:00:00Z"), ctx());
  assert.ok(r.effects.includes("celebrate:level"));
  assert.equal(r.state.progress.level, 2);
  const r2 = applyAction({ ...r.state, needs: { ...r.state.needs, fullness: 50 } }, "feed", at("2026-09-18T12:00:01Z"), ctx());
  assert.ok(!r2.effects.includes("celebrate:level"));
});

test("rituals: windows in the home timezone; goodnight after midnight belongs to the previous day", () => {
  const s0 = { ...createInitialState(at("2026-09-18T05:00:00Z"), 1), needs: { fullness: 50, fun: 50, love: 50, energy: 50 } };
  const r1 = applyAction(s0, "feed", at("2026-09-18T07:00:00Z"), ctx());
  assert.ok(r1.effects.includes("ritual:breakfast"));
  const late = applyAction(s0, "feed", at("2026-09-18T13:00:00Z"), ctx());
  assert.ok(!late.effects.includes("ritual:breakfast"));
  const r2 = applyAction(r1.state, "play", at("2026-09-18T15:00:00Z"), ctx());
  assert.ok(r2.effects.includes("ritual:playtime"));
  const r3 = applyAction(r2.state, "sleep", at("2026-09-19T01:00:00Z"), ctx());
  assert.ok(r3.effects.includes("ritual:goodnight"), "01:00 next day still counts for the 18th");
  assert.ok(r3.effects.includes("fullday"));
  assert.equal(r3.state.progress.streak.count, 1);
  assert.equal(r3.state.progress.streak.lastFullDay, "2026-09-18");
  assert.equal(r3.state.progress.today, "2026-09-18");
  // Manila: 07:00 local breakfast
  const manila = applyAction(s0, "feed", at("2026-09-17T23:00:00Z"), { partnerId: "a", timezone: "Asia/Manila" });
  assert.ok(manila.effects.includes("ritual:breakfast"));
  const laNight = applyAction(s0, "sleep", at("2026-09-19T04:30:00Z"), { partnerId: "a", timezone: "America/Los_Angeles" }); // 21:30 PDT
  assert.ok(laNight.effects.includes("ritual:goodnight"));
});

test("rollover resets rituals and daily points at 03:00 local", () => {
  let s = applyAction(mid(), "play", at("2026-09-18T12:00:00Z"), ctx()).state;
  assert.ok(s.progress.rituals.playtime);
  s = applyDecay(s, at("2026-09-19T02:00:00Z"), ctx());
  assert.ok(s.progress.rituals.playtime, "still the same ritual day before 03:00");
  s = applyDecay(s, at("2026-09-19T03:00:00Z"), ctx());
  assert.equal(s.progress.rituals.playtime, null);
  assert.deepEqual(s.progress.dailyPoints, {});
  assert.equal(s.progress.today, "2026-09-19");
});

function fullDay(state, dayIso) {
  const fresh = (st) => ({ ...st, needs: { fullness: 50, fun: 50, love: 50, energy: 50 } });
  let s = applyAction(fresh(state), "feed", at(`${dayIso}T07:00:00Z`), ctx()).state;
  s = applyAction(fresh(s), "play", at(`${dayIso}T15:00:00Z`), ctx()).state;
  const r = applyAction(fresh(s), "sleep", at(`${dayIso}T21:00:00Z`), ctx());
  s = applyAction(r.state, "wake", at(`${dayIso}T22:00:00Z`), ctx()).state;
  return { state: s, effects: r.effects };
}

test("streak: consecutive days increment, one-day gap uses a freeze once per ISO week, second gap resets", () => {
  let s = createInitialState(at("2026-09-14T00:00:00Z"), 1);
  s = fullDay(s, "2026-09-14").state; assert.equal(s.progress.streak.count, 1);
  s = fullDay(s, "2026-09-15").state; assert.equal(s.progress.streak.count, 2);
  const gap = fullDay(s, "2026-09-17");                                    // skipped the 16th
  assert.equal(gap.state.progress.streak.count, 3);
  assert.ok(gap.effects.includes("toast:streak.freeze"));
  assert.equal(gap.state.progress.streak.freezeUsedWeek, "2026-W38");
  const gap2 = fullDay(gap.state, "2026-09-19");                           // skipped the 18th, same week
  assert.equal(gap2.state.progress.streak.count, 1);
  const gap3 = fullDay(gap2.state, "2026-09-21");                          // skipped the 20th, new ISO week
  assert.equal(gap3.state.progress.streak.count, 2);
});

test("streak milestones fire celebrate:streak once", () => {
  let s = createInitialState(at("2026-09-01T00:00:00Z"), 1);
  let fired = 0;
  for (let d = 1; d <= 8; d++) {
    const r = fullDay(s, `2026-09-${String(d).padStart(2, "0")}`);
    s = r.state;
    if (r.effects.includes("celebrate:streak")) fired++;
  }
  assert.equal(s.progress.streak.count, 8);
  assert.equal(fired, 1);
});
