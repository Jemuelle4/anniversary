// Pure outbox reducer (docs/phase-2 §7.2). Persisted by Syncer; tested in isolation.
import { applyAction } from "../game/actions.js";

export const MAX_REBASES = 5;

export function enqueue(outbox, event) { return [...outbox, event]; }
export function remove(outbox, id) { return outbox.filter((e) => e.id !== id); }

/**
 * Re-derive every pending event on top of the server's state.
 * Returns { outbox, state, version, dropped: [{ event, reason }] }.
 */
export function rebase(outbox, serverState, serverVersion, now, ctx = {}, apply = applyAction) {
  let state = serverState, version = serverVersion;
  const next = [], dropped = [];
  for (const ev of outbox) {
    const rebases = (ev.rebases ?? 0) + 1;
    if (rebases > MAX_REBASES) { dropped.push({ event: ev, reason: "rebaseLimit" }); continue; }
    const r = apply(state, ev.type, now, { ...ctx, seed: ev.payload?.seed ?? ctx.seed });
    if (!r.ok) { dropped.push({ event: ev, reason: r.reason }); continue; }
    const payload = r.effects.includes("bites:respawn") ? { seed: r.state.bites.seed } : {};
    next.push({ ...ev, expectedVersion: version, newState: r.state, payload, rebases });
    state = r.state; version += 1;
  }
  return { outbox: next, state, version, dropped };
}
