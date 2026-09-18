/** Deterministic 32-bit PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A fresh random 31-bit seed. The only Math.random in src/game; callers may inject their own. */
export function randomSeed(rand = Math.random) {
  return Math.floor(rand() * 0x7fffffff) || 1;
}
