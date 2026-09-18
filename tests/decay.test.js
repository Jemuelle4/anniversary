import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDecay } from "../src/game/decay.js";
import { createInitialState } from "../src/game/state.js";

const T0 = Date.parse("2026-09-18T10:00:00Z");
const H = 3_600_000;

test("1h awake drops fullness 4, fun 3, love 2, energy 3", () => {
  const s = applyDecay(createInitialState(T0, 1), T0 + H);
  assert.deepEqual(s.needs, { fullness: 76, fun: 77, love: 78, energy: 97 });
  assert.equal(s.updatedAt, T0 + H);
});

test("asleep: energy rises 15/h and other needs use asleep rates", () => {
  const s0 = { ...createInitialState(T0, 1), asleep: true, sleepStartedAt: T0, needs: { fullness: 80, fun: 80, love: 80, energy: 40 } };
  const s = applyDecay(s0, T0 + H);
  assert.deepEqual(s.needs, { fullness: 78, fun: 79, love: 79, energy: 55 });
  assert.equal(s.asleep, true);
});

test("decay floors at 10 but does not raise a need already below 10", () => {
  const s = applyDecay(createInitialState(T0, 1), T0 + 100 * H);
  assert.deepEqual(s.needs, { fullness: 10, fun: 10, love: 10, energy: 10 });
  const low = { ...createInitialState(T0, 1), needs: { fullness: 80, fun: 80, love: 4, energy: 80 } };
  assert.equal(applyDecay(low, T0 + H).needs.love, 4);
});

test("clock going backwards applies no decay", () => {
  const s = applyDecay(createInitialState(T0, 1), T0 - H);
  assert.deepEqual(s.needs, createInitialState(T0, 1).needs);
});

test("auto-wake after >= 30 min at 100 energy, not before", () => {
  const s0 = { ...createInitialState(T0, 1), asleep: true, sleepStartedAt: T0, needs: { fullness: 80, fun: 80, love: 80, energy: 100 } };
  const early = applyDecay(s0, T0 + 10 * 60_000);
  assert.equal(early.asleep, true);
  const late = applyDecay(s0, T0 + 31 * 60_000);
  assert.equal(late.asleep, false);
  assert.equal(late.sleepStartedAt, null);
  assert.equal(late.autoWoke, true);
});

test("does not mutate its input", () => {
  const s0 = createInitialState(T0, 1);
  applyDecay(s0, T0 + H);
  assert.equal(s0.needs.fullness, 80);
});
