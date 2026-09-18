import { test } from "node:test";
import assert from "node:assert/strict";
import { moodFor } from "../src/game/mood.js";
import { createInitialState } from "../src/game/state.js";

const st = (needs, asleep = false) => ({ ...createInitialState(0, 1), asleep, needs });
const all = (v) => ({ fullness: v, fun: v, love: v, energy: v });

test("threshold boundaries", () => {
  assert.equal(moodFor(st(all(85))).mood, "ecstatic");
  assert.equal(moodFor(st(all(84))).mood, "happy");
  assert.equal(moodFor(st(all(65))).mood, "happy");
  assert.equal(moodFor(st(all(64))).mood, "okay");
  assert.equal(moodFor(st(all(45))).mood, "okay");
  assert.equal(moodFor(st(all(44))).mood, "meh");
  assert.equal(moodFor(st(all(25))).mood, "meh");
  assert.equal(moodFor(st(all(24))).mood, "sulky");
});

test("weights: energy counts least", () => {
  assert.equal(moodFor(st({ fullness: 100, fun: 100, love: 100, energy: 20 })).mood, "ecstatic");
});

test("any need <20 caps at meh; <10 forces sulky; asleep shows sleeping", () => {
  assert.equal(moodFor(st({ fullness: 100, fun: 100, love: 100, energy: 19 })).mood, "meh");
  assert.equal(moodFor(st({ fullness: 100, fun: 100, love: 100, energy: 9 })).mood, "sulky");
  assert.equal(moodFor(st(all(90), true)).mood, "sleeping");
});

test("thought is the lowest need's icon only when below 40 and awake", () => {
  assert.equal(moodFor(st({ fullness: 39, fun: 80, love: 80, energy: 80 })).thought, "🍞");
  assert.equal(moodFor(st({ fullness: 41, fun: 80, love: 80, energy: 80 })).thought, null);
  assert.equal(moodFor(st({ fullness: 39, fun: 80, love: 80, energy: 80 }, true)).thought, null);
  assert.equal(moodFor(st({ fullness: 50, fun: 30, love: 20, energy: 60 })).lowestNeed, "love");
});
