import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDecay } from "../src/game/decay.js";
import { createInitialState } from "../src/game/state.js";

const { vectors } = JSON.parse(readFileSync(new URL("./fixtures/decay-vectors.json", import.meta.url), "utf8"));
for (const v of vectors) {
  test(`decay vector: ${v.name}`, () => {
    const T0 = 1_000_000_000;
    const s = { ...createInitialState(T0, 1), asleep: v.asleep, sleepStartedAt: v.asleep ? T0 : null, needs: { ...v.before } };
    const out = applyDecay(s, T0 + v.elapsedHours * 3_600_000);
    const rounded = Object.fromEntries(Object.entries(out.needs).map(([k, x]) => [k, Math.round(x)]));
    assert.deepEqual(rounded, v.after);
  });
}
