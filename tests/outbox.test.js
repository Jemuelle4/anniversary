import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueue, rebase, remove, MAX_REBASES } from "../src/sync/outbox.js";
import { applyAction } from "../src/game/actions.js";
import { createInitialState } from "../src/game/state.js";
import { Syncer } from "../src/sync/syncer.js";

const T0 = 1_000_000;
const base = () => ({ ...createInitialState(T0, 1), needs: { fullness: 50, fun: 50, love: 50, energy: 50 } });
function pending(type, expectedVersion, state) {
  const r = applyAction(state, type, T0);
  return { ev: { id: `${type}-${expectedVersion}`, type, clientAt: T0, expectedVersion, newState: r.state, payload: {} }, state: r.state };
}

test("enqueue/remove keep order", () => {
  let o = enqueue([], { id: "a" }); o = enqueue(o, { id: "b" });
  assert.deepEqual(o.map((e) => e.id), ["a", "b"]);
  assert.deepEqual(remove(o, "a").map((e) => e.id), ["b"]);
});

test("rebase re-derives pending events on the server state with fresh expected versions", () => {
  const s0 = base();
  const a = pending("feed", 3, s0); const b = pending("play", 4, a.state);
  const server = { ...s0, needs: { ...s0.needs, love: 90 } };
  const r = rebase([a.ev, b.ev], server, 7, T0);
  assert.equal(r.outbox.length, 2);
  assert.deepEqual(r.outbox.map((e) => e.expectedVersion), [7, 8]);
  assert.equal(r.outbox[0].newState.needs.love, 90, "server change is preserved");
  assert.equal(r.outbox[0].newState.needs.fullness, 80);
  assert.equal(r.outbox[1].newState.needs.fun, 80);
  assert.equal(r.version, 9);
  assert.equal(r.dropped.length, 0);
  assert.equal(r.outbox[0].rebases, 1);
});

test("rebase drops events that are refused on the new state, with the reason", () => {
  const s0 = base();
  const a = pending("play", 1, s0);
  const server = { ...s0, needs: { ...s0.needs, energy: 5 } };
  const r = rebase([a.ev], server, 2, T0);
  assert.equal(r.outbox.length, 0);
  assert.equal(r.dropped[0].reason, "tooTired");
  assert.equal(r.version, 2);
});

test("rebase cap drops after MAX_REBASES; respawn seed is carried in payload", () => {
  const s0 = base();
  const a = pending("feed", 1, s0);
  const r = rebase([{ ...a.ev, rebases: MAX_REBASES }], s0, 1, T0);
  assert.equal(r.dropped[0].reason, "rebaseLimit");
  const eaten = { ...s0, bites: { seed: 1, count: 19 } };
  const n = pending("nibble", 1, eaten);
  const r2 = rebase([n.ev], eaten, 1, T0);
  assert.equal(typeof r2.outbox[0].payload.seed, "number");
});

test("Syncer: flushes in order, handles version conflicts by rebasing, retries on network errors", async () => {
  const s0 = base();
  let serverState = s0, serverVersion = 1, calls = 0, failNext = true;
  const store = {
    async commit(ev) {
      calls++;
      if (failNext) { failNext = false; throw new Error("network"); }
      if (ev.expectedVersion !== serverVersion) return { ok: false, code: "version", state: serverState, version: serverVersion };
      serverState = ev.newState; serverVersion += 1;
      return { ok: true, state: serverState, version: serverVersion, event: { id: ev.id } };
    },
  };
  const adopted = [];
  const syncer = new Syncer({ store, now: () => T0, ctx: () => ({}), storage: null, onServerState: (s, v) => adopted.push(v), onDropped: () => {}, onStatus: () => {} });
  const a = pending("feed", 1, s0);
  syncer.push(a.ev);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(syncer.online, false, "network error marks offline");
  // partner commits meanwhile
  serverState = { ...s0, needs: { ...s0.needs, love: 99 } }; serverVersion = 2;
  clearTimeout(syncer.timer);
  await syncer.flush();
  assert.equal(syncer.outbox.length, 0);
  assert.equal(serverVersion, 3);
  assert.equal(serverState.needs.love, 99);
  assert.equal(serverState.needs.fullness, 80);
  assert.ok(adopted.includes(3));
  assert.equal(syncer.online, true);
});
