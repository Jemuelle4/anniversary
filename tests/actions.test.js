import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, canApply, effectsFor } from "../src/game/actions.js";
import { createInitialState } from "../src/game/state.js";

const T0 = Date.parse("2026-09-18T10:00:00Z");
const H = 3_600_000;
const base = (needs = {}, extra = {}) => ({ ...createInitialState(T0, 1), ...extra, needs: { fullness: 50, fun: 50, love: 50, energy: 50, ...needs } });

test("feed +30 fullness +5 fun, refused when stuffed", () => {
  const r = applyAction(base(), "feed", T0);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.needs, { fullness: 80, fun: 55, love: 50, energy: 50 });
  assert.ok(r.effects.includes("anim:feed") && r.effects.includes("toast:feed.ok"));
  assert.equal(r.state.lastAction.type, "feed");
  assert.equal(r.state.counters.feed, 1);
  const stuffed = applyAction(base({ fullness: 96 }), "feed", T0);
  assert.equal(stuffed.ok, false);
  assert.equal(stuffed.reason, "stuffed");
  assert.equal(stuffed.state.needs.fullness, 96);
});

test("clamp at 100 and 0; decay is applied before the action", () => {
  const r = applyAction(createInitialState(T0, 1), "feed", T0 + H);   // 80 - 4 + 30 = 106 -> 100
  assert.equal(r.state.needs.fullness, 100);
  const low = applyAction(base({ love: 1 }), "nibble", T0);
  assert.equal(low.state.needs.love, 0);
});

test("cuddle +25 love +5 fun and heals up to 5 bites", () => {
  const r = applyAction(base({}, { bites: { seed: 1, count: 7 } }), "cuddle", T0);
  assert.deepEqual(r.state.needs, { fullness: 50, fun: 55, love: 75, energy: 50 });
  assert.equal(r.state.bites.count, 2);
  assert.equal(applyAction(base({}, { bites: { seed: 1, count: 3 } }), "cuddle", T0).state.bites.count, 0);
});

test("play +25 fun -10 energy -5 fullness, refused under 15 energy", () => {
  const r = applyAction(base(), "play", T0);
  assert.deepEqual(r.state.needs, { fullness: 45, fun: 75, love: 50, energy: 40 });
  const tired = applyAction(base({ energy: 14 }), "play", T0);
  assert.equal(tired.reason, "tooTired");
  assert.ok(tired.effects.includes("toast:play.tooTired"));
});

test("nibble increments bites; 20th nibble respawns", () => {
  const r = applyAction(base(), "nibble", T0);
  assert.equal(r.state.bites.count, 1);
  assert.deepEqual(r.state.needs, { fullness: 50, fun: 58, love: 47, energy: 50 });
  const last = applyAction(base({}, { bites: { seed: 1, count: 19 } }), "nibble", T0, { seed: 999 });
  assert.equal(last.state.bites.count, 0);
  assert.equal(last.state.bites.seed, 999);
  assert.equal(last.state.counters.eaten, 1);
  assert.deepEqual(last.state.needs, { fullness: 50, fun: 73, love: 37, energy: 50 });
  assert.ok(last.effects.includes("bites:respawn") && last.effects.includes("toast:nibble.eaten"));
});

test("boom +15 fun -15 energy, clears bites, sets cooldown; refused under 20 energy or during cooldown", () => {
  const r = applyAction(base({}, { bites: { seed: 1, count: 9 } }), "boom", T0);
  assert.deepEqual(r.state.needs, { fullness: 50, fun: 65, love: 50, energy: 35 });
  assert.equal(r.state.bites.count, 0);
  assert.equal(r.state.bites.seed, 1);
  assert.equal(r.state.cooldowns.boom, T0 + 60_000);
  assert.equal(applyAction(r.state, "boom", T0 + 30_000).reason, "cooldown");
  assert.equal(applyAction(r.state, "boom", T0 + 60_000).ok, true);
  assert.equal(applyAction(base({ energy: 19 }), "boom", T0).reason, "tooTired");
});

test("sleep/wake transitions with grumpy and rested branches", () => {
  const s = applyAction(base(), "sleep", T0);
  assert.equal(s.ok, true);
  assert.equal(s.state.asleep, true);
  assert.equal(s.state.sleepStartedAt, T0);
  assert.equal(applyAction(s.state, "sleep", T0 + 1000).reason, "asleep");
  const grumpy = applyAction(s.state, "wake", T0 + 10 * 60_000);
  assert.equal(grumpy.state.asleep, false);
  assert.ok(grumpy.effects.includes("toast:wake.grumpy"));
  assert.equal(grumpy.state.needs.fun, 45);
  const rested = applyAction(s.state, "wake", T0 + 40 * 60_000);
  assert.ok(rested.effects.includes("toast:wake.rested"));
  assert.equal(rested.state.needs.fun, Math.round(50 - 40 / 60 + 5));
  assert.equal(applyAction(base(), "wake", T0).reason, "awake");
});

test("every action except wake is refused while asleep", () => {
  const asleep = { ...base(), asleep: true, sleepStartedAt: T0 };
  for (const t of ["feed", "cuddle", "play", "nibble", "boom", "sleep"]) {
    const r = applyAction(asleep, t, T0 + 1000);
    assert.equal(r.ok, false, t);
    assert.equal(r.reason, "asleep", t);
  }
  assert.equal(canApply(asleep, "wake", T0).ok, true);
});

test("auto-wake during decay surfaces an anim:wake effect on the next action", () => {
  const asleep = { ...base({ energy: 100 }), asleep: true, sleepStartedAt: T0 };
  const r = applyAction(asleep, "feed", T0 + H);
  assert.equal(r.ok, true);
  assert.equal(r.state.asleep, false);
  assert.ok(r.effects.includes("anim:wake"));
});

test("partnerId is recorded on lastAction; unknown action refused", () => {
  const r = applyAction(base(), "cuddle", T0, { partnerId: "p1" });
  assert.equal(r.state.lastAction.by, "p1");
  assert.equal(applyAction(base(), "dance", T0).reason, "unknown");
});

test("effectsFor reproduces tags from a remote event row", () => {
  const prev = createInitialState(T0, 1);
  const after = structuredClone(prev); after.progress.level = 2; after.progress.rituals.playtime = { by: "p", at: T0 };
  const e = effectsFor(prev, { type: "nibble", payload: { seed: 5 }, state_after: after });
  assert.deepEqual(e, ["anim:nibble", "bites:respawn", "celebrate:level", "ritual:playtime"]);
  assert.deepEqual(effectsFor(prev, { type: "join", payload: {}, state_after: prev }), []);
});
