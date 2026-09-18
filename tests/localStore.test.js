import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalStore, LOCAL_KEYS } from "../src/store/localStore.js";
import { createInitialState } from "../src/game/state.js";

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

test("load returns null when empty; init + commit + load round trip", async () => {
  const storage = fakeStorage();
  const store = new LocalStore({ storage, now: () => 1000 });
  assert.equal(await store.load(), null);
  const s0 = createInitialState(1000, 1);
  await store.init(s0);
  const next = { ...s0, needs: { ...s0.needs, fullness: 100 } };
  const r = await store.commit({ id: "e1", type: "feed", clientAt: 1000, expectedVersion: 0, newState: next, payload: {} });
  assert.equal(r.ok, true); assert.equal(r.version, 1); assert.equal(r.event.partner_id, "local");
  const again = new LocalStore({ storage, now: () => 2000 });
  const snap = await again.load();
  assert.equal(snap.state.needs.fullness, 100);
  assert.equal(snap.version, 1);
  assert.equal(snap.events[0].type, "feed");
  assert.equal(snap.partners[0].id, "local");
  assert.ok(snap.home.timezone);
});

test("invalid JSON loads as null; storage errors fall back to memory", async () => {
  const store = new LocalStore({ storage: fakeStorage({ [LOCAL_KEYS.state]: "{nope" }) });
  assert.equal(await store.load(), null);
  let errors = 0;
  const broken = { getItem: () => { throw new Error("quota"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  const mem = new LocalStore({ storage: broken, onStorageError: () => errors++ });
  await mem.init(createInitialState(0, 1));
  await mem.commit({ id: "e", type: "cuddle", clientAt: 0, expectedVersion: 0, newState: createInitialState(0, 1), payload: {} });
  assert.ok(errors > 0);
  assert.equal(mem.version, 1);
});

test("clear records a reset event; takeForMigration moves the state aside", async () => {
  const storage = fakeStorage();
  const store = new LocalStore({ storage, now: () => 5 });
  await store.init(createInitialState(5, 1));
  await store.clear(createInitialState(6, 2));
  assert.equal((await store.load()).events[0].type, "reset");
  assert.equal(store.hasLocalState(), true);
  const taken = store.takeForMigration();
  assert.equal(taken.bites.seed, 2);
  assert.equal(store.hasLocalState(), false);
  assert.ok(storage.map.has(LOCAL_KEYS.migrated));
});
