import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, createHome, joinHome, commitAction, homeSnapshot, resetHome, leaveHome, selectAsUser, makeInviteCode, isValidState, CLOCK_SKEW_MS } from "./localDb.js";
import { initialState, withNeed } from "./fixtures.js";

const T0 = Date.parse("2026-09-18T10:00:00Z");

function pairedHome() {
  const db = openDb();
  const a = createHome(db, { userId: "user-a", name: "Sam", color: "rose", initialState: initialState(T0), now: T0 });
  const b = joinHome(db, { userId: "user-b", code: a.invite_code, name: "Alex", color: "sky", now: T0 + 1000 });
  return { db, a, b };
}

test("create_home makes home, partner, member, state at version 1 with a join event", () => {
  const db = openDb();
  const r = createHome(db, { userId: "user-a", name: "Sam", color: "rose", initialState: initialState(T0), now: T0 });
  assert.match(r.invite_code, /^PLUSH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.equal(r.version, 1);
  const snap = homeSnapshot(db, { userId: "user-a" });
  assert.equal(snap.events.length, 1);
  assert.equal(snap.events[0].type, "join");
  assert.deepEqual(snap.events[0].payload, { name: "Sam", color: "rose" });
});

test("create_home with a brought local state records a migrate event (version 2)", () => {
  const db = openDb();
  const r = createHome(db, { userId: "u", name: "Sam", color: "rose", initialState: initialState(T0), now: T0, broughtLocal: true });
  assert.equal(r.version, 2);
  assert.deepEqual(homeSnapshot(db, { userId: "u" }).events.map(e => e.type), ["migrate", "join"]);
});

test("create_home refuses a user who is already a member", () => {
  const { db } = pairedHome();
  assert.throws(() => createHome(db, { userId: "user-a", name: "X", color: "mint", initialState: initialState(T0) }), /already_member/);
});

test("join_home is case-insensitive on the code, adds a partner, and bumps version", () => {
  const db = openDb();
  const a = createHome(db, { userId: "user-a", name: "Sam", color: "rose", initialState: initialState(T0), now: T0 });
  const b = joinHome(db, { userId: "user-b", code: a.invite_code.toLowerCase(), name: "Alex", color: "sky", now: T0 });
  assert.equal(b.home_id, a.home_id);
  assert.equal(b.version, 2);
  assert.equal(homeSnapshot(db, { userId: "user-b" }).partners.length, 2);
});

test("join_home with an existing partner name links a second device to that partner", () => {
  const { db, a } = pairedHome();
  const c = joinHome(db, { userId: "user-a-laptop", code: a.invite_code, name: "Sam", color: "mint", now: T0 });
  assert.equal(c.partner_id, a.partner_id);
  assert.equal(homeSnapshot(db, { userId: "user-a-laptop" }).partners.length, 2);
});

test("join_home rejects unknown codes and a third partner", () => {
  const { db, a } = pairedHome();
  assert.throws(() => joinHome(db, { userId: "x", code: "PLUSH-ZZZZ", name: "Z", color: "mint" }), /not_found/);
  assert.throws(() => joinHome(db, { userId: "y", code: a.invite_code, name: "Third", color: "mint" }), /home_full/);
  assert.equal(homeSnapshot(db, { userId: "user-a" }).partners.length, 2);
});

test("join_home is idempotent for an existing member", () => {
  const { db, a, b } = pairedHome();
  const again = joinHome(db, { userId: "user-b", code: "PLUSH-XXXX", name: "Whatever", color: "mint" });
  assert.equal(again.home_id, a.home_id);
  assert.equal(again.partner_id, b.partner_id);
  assert.equal(again.existing, true);
});

test("commit_action: happy path bumps version, stores state, records event with state_after", () => {
  const { db, a, b } = pairedHome();
  const next = withNeed(initialState(T0), "fullness", 100);
  const r = commitAction(db, { userId: "user-a", eventId: "e1", type: "feed", clientAt: T0 + 5000, expectedVersion: b.version, newState: next, now: T0 + 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.version, b.version + 1);
  assert.deepEqual(r.state, next);
  assert.equal(r.event.partner_id, a.partner_id);
  assert.deepEqual(r.event.state_after, next);
  const snap = homeSnapshot(db, { userId: "user-b" });
  assert.equal(snap.version, r.version);
  assert.deepEqual(snap.state, next);
});

test("commit_action: duplicate event id is idempotent and does not bump version", () => {
  const { db, b } = pairedHome();
  const next = withNeed(initialState(T0), "fun", 100);
  const first = commitAction(db, { userId: "user-a", eventId: "dup", type: "play", clientAt: T0, expectedVersion: b.version, newState: next, now: T0 });
  const second = commitAction(db, { userId: "user-a", eventId: "dup", type: "play", clientAt: T0, expectedVersion: b.version, newState: next, now: T0 });
  assert.equal(second.ok, true);
  assert.equal(second.code, "duplicate");
  assert.equal(second.version, first.version);
  assert.equal(homeSnapshot(db, { userId: "user-a" }).events.filter(e => e.type === "play").length, 1);
});

test("commit_action: stale expected version is rejected with the current server state", () => {
  const { db, b } = pairedHome();
  const s1 = withNeed(initialState(T0), "love", 100);
  const ok = commitAction(db, { userId: "user-a", eventId: "e1", type: "cuddle", clientAt: T0, expectedVersion: b.version, newState: s1, now: T0 });
  const stale = commitAction(db, { userId: "user-b", eventId: "e2", type: "feed", clientAt: T0, expectedVersion: b.version, newState: withNeed(initialState(T0), "fullness", 100), now: T0 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "version");
  assert.equal(stale.version, ok.version);
  assert.deepEqual(stale.state, s1);
  // Rebase: client re-applies on the returned state and retries.
  const rebased = commitAction(db, { userId: "user-b", eventId: "e2", type: "feed", clientAt: T0, expectedVersion: stale.version, newState: withNeed(s1, "fullness", 100), now: T0 });
  assert.equal(rebased.ok, true);
  assert.equal(rebased.version, ok.version + 1);
});

test("commit_action: invalid state and clock skew are rejected without side effects", () => {
  const { db, b } = pairedHome();
  const bad = commitAction(db, { userId: "user-a", eventId: "e1", type: "feed", clientAt: T0, expectedVersion: b.version, newState: withNeed(initialState(T0), "fullness", 140), now: T0 });
  assert.equal(bad.code, "invalid");
  const skew = commitAction(db, { userId: "user-a", eventId: "e2", type: "feed", clientAt: T0 - CLOCK_SKEW_MS - 1, expectedVersion: b.version, newState: initialState(T0), now: T0 });
  assert.equal(skew.code, "clock");
  assert.equal(homeSnapshot(db, { userId: "user-a" }).version, b.version);
  assert.equal(homeSnapshot(db, { userId: "user-a" }).events.length, 2);
});

test("commit_action: non-members cannot write", () => {
  const { db, b } = pairedHome();
  assert.throws(() => commitAction(db, { userId: "stranger", eventId: "e", type: "feed", clientAt: T0, expectedVersion: b.version, newState: initialState(T0), now: T0 }), /not_member/);
});

test("event versions are dense per home and ordered", () => {
  const { db, b } = pairedHome();
  let v = b.version;
  for (let i = 0; i < 5; i++) {
    const r = commitAction(db, { userId: i % 2 ? "user-a" : "user-b", eventId: `e${i}`, type: "nibble", clientAt: T0 + i, expectedVersion: v, newState: initialState(T0), now: T0 + i });
    assert.equal(r.ok, true); v = r.version;
  }
  const versions = homeSnapshot(db, { userId: "user-a" }).events.map(e => e.version);
  assert.deepEqual(versions, [7, 6, 5, 4, 3, 2, 1]);
});

test("reset_home records a reset event; leave_home removes only the membership", () => {
  const { db, a } = pairedHome();
  const r = resetHome(db, { userId: "user-b", newState: initialState(T0 + 1), now: T0 + 1 });
  assert.equal(homeSnapshot(db, { userId: "user-a" }).events[0].type, "reset");
  assert.equal(r.version, 3);
  leaveHome(db, { userId: "user-b" });
  assert.equal(homeSnapshot(db, { userId: "user-b" }), null);
  assert.equal(homeSnapshot(db, { userId: "user-a" }).partners.length, 2, "partner row stays");
  assert.equal(homeSnapshot(db, { userId: "user-a" }).home.id, a.home_id);
});

test("RLS emulation: a user sees only their own home's rows", () => {
  const db = openDb();
  createHome(db, { userId: "u1", name: "A", color: "rose", initialState: initialState(T0), now: T0 });
  createHome(db, { userId: "u2", name: "B", color: "sky", initialState: initialState(T0), now: T0 });
  assert.equal(selectAsUser(db, { userId: "u1", table: "plush_events" }).length, 1);
  assert.equal(selectAsUser(db, { userId: "u1", table: "partners" }).length, 1);
  assert.equal(selectAsUser(db, { userId: "nobody", table: "plush_state" }).length, 0);
});

test("invite code alphabet excludes ambiguous characters; is_valid_state checks the documented invariants", () => {
  for (let i = 0; i < 200; i++) assert.doesNotMatch(makeInviteCode().slice(6), /[01OIL]/);
  assert.equal(isValidState(initialState()), true);
  assert.equal(isValidState({ ...initialState(), asleep: "no" }), false);
  assert.equal(isValidState({ ...initialState(), bites: { seed: 1, count: 21 } }), false);
  assert.equal(isValidState({ ...initialState(), version: 3, progress: { level: 11 } }), false);
  assert.equal(isValidState({ ...initialState(), version: 3, progress: { level: 4 } }), true);
});
