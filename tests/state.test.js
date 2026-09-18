import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState, isValidState, migrate } from "../src/game/state.js";

test("initial state matches schema and validates", () => {
  const s = createInitialState(123, 9);
  assert.equal(s.version, 3);
  assert.deepEqual(s.needs, { fullness: 80, fun: 80, love: 80, energy: 100 });
  assert.deepEqual(s.bites, { seed: 9, count: 0 });
  assert.equal(s.progress.level, 1);
  assert.equal(isValidState(s), true);
});

test("migrate: null/garbage -> fresh; partial v1 -> defaults filled; v2 -> by null kept", () => {
  assert.equal(isValidState(migrate(null, 5)), true);
  assert.equal(isValidState(migrate("nope", 5)), true);
  const v1 = { version: 1, needs: { fullness: 33, fun: 200, love: -4 }, asleep: true, sleepStartedAt: 10, bites: { seed: 3, count: 25 }, lastAction: { type: "feed", at: 4 } };
  const m = migrate(v1, 99);
  assert.equal(isValidState(m), true);
  assert.deepEqual(m.needs, { fullness: 33, fun: 100, love: 0, energy: 100 });
  assert.equal(m.bites.count, 20);
  assert.equal(m.asleep, true);
  assert.equal(m.lastAction.by, null);
  assert.equal(m.progress.level, 1);
  const v2 = { ...createInitialState(1, 1), version: 2, lastAction: { type: "play", at: 2, by: "p" } };
  delete v2.progress;
  assert.equal(migrate(v2).lastAction.by, "p");
});

test("isValidState rejects bad shapes", () => {
  const s = createInitialState(0, 1);
  assert.equal(isValidState({ ...s, version: 2 }), false);
  assert.equal(isValidState({ ...s, needs: { ...s.needs, fun: 101 } }), false);
  assert.equal(isValidState({ ...s, asleep: "no" }), false);
  assert.equal(isValidState({ ...s, bites: { seed: 1, count: 21 } }), false);
  assert.equal(isValidState({ ...s, progress: { ...s.progress, level: 11 } }), false);
});
