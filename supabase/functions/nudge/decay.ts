// The one deliberate copy of src/game/decay.js arithmetic (docs/phase-4 §3).
// Pinned by tests/fixtures/decay-vectors.json via decay_test.ts.
export type Needs = { fullness: number; fun: number; love: number; energy: number };
const RATES = { awake: { fullness: 4, fun: 3, love: 2, energy: 3 }, asleep: { fullness: 2, fun: 1, love: 1, energy: -15 } };
const FLOOR = 10;
export function decayNeeds(before: Needs, asleep: boolean, elapsedHours: number): Needs {
  const h = Math.max(0, elapsedHours);
  const rates = asleep ? RATES.asleep : RATES.awake;
  const out = { ...before };
  for (const n of ["fullness", "fun", "love", "energy"] as const) {
    const raw = before[n] - rates[n] * h;
    const floor = Math.min(FLOOR, before[n]);
    out[n] = Math.max(floor, Math.min(100, raw));
  }
  return out;
}
