import { test } from "node:test";
import assert from "node:assert/strict";
import { bitePoints, svgMaskDataUrl, maskForState } from "../src/game/bites.js";
import { createInitialState } from "../src/game/state.js";

test("same seed gives identical points; different seeds differ", () => {
  assert.deepEqual(bitePoints(42), bitePoints(42));
  assert.notDeepEqual(bitePoints(42), bitePoints(43));
  assert.equal(bitePoints(42).length, 20);
});
test("points inside 5-95, radii 8-13", () => {
  for (const p of bitePoints(7)) {
    assert.ok(p.x >= 5 && p.x <= 95 && p.y >= 5 && p.y <= 95);
    assert.ok(p.r >= 8 && p.r <= 13);
  }
});
test("mask url encodes circles; empty gives null", () => {
  assert.equal(svgMaskDataUrl([]), null);
  const url = svgMaskDataUrl(bitePoints(1).slice(0, 2));
  assert.match(url, /^url\("data:image\/svg\+xml,/);
  assert.equal(decodeURIComponent(url).split("<circle").length - 1, 2);
  const s = createInitialState(0, 1); s.bites.count = 3;
  assert.equal(decodeURIComponent(maskForState(s)).split("<circle").length - 1, 3);
});
