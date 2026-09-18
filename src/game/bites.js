import { MAX_BITES } from "./constants.js";
import { mulberry32 } from "./rng.js";

/** Deterministic spiral of bite points (ported from the original initBiteState). */
export function bitePoints(seed) {
  const rand = mulberry32(seed);
  const startAngle = rand() * Math.PI * 2;
  const startR = 47, endR = 6, turns = 2.2;
  const points = [];
  for (let i = 0; i < MAX_BITES; i++) {
    const t = i / (MAX_BITES - 1);
    const r = startR + (endR - startR) * t;
    const theta = startAngle + (turns * Math.PI * 2) * t;
    let x = 50 + r * Math.cos(theta) + (rand() * 2 - 1) * 1.2;
    let y = 50 + r * Math.sin(theta) + (rand() * 2 - 1) * 1.2;
    x = Math.max(5, Math.min(95, x));
    y = Math.max(5, Math.min(95, y));
    points.push({ x, y, r: 8 + rand() * 5 });
  }
  return points;
}

/** CSS url() for an SVG mask with the given bite circles cut out. Empty -> null (no mask). */
export function svgMaskDataUrl(bites) {
  if (!bites.length) return null;
  const circles = bites.map((b) => `<circle cx="${b.x.toFixed(2)}" cy="${b.y.toFixed(2)}" r="${b.r.toFixed(2)}" fill="black"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><mask id="m"><rect width="100" height="100" fill="white"/>${circles}</mask><rect width="100" height="100" fill="white" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function maskForState(state) {
  return svgMaskDataUrl(bitePoints(state.bites.seed).slice(0, state.bites.count));
}
