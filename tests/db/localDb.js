// Reference implementation of the phase 2 RPCs over SQLite (node:sqlite, Node >= 22.13).
// This is TEST INFRASTRUCTURE, not application code. It exists so the DB architecture in
// docs/phase-2-shared-sync.md can be exercised locally, and so the Postgres RPCs can be
// written later by reading executable semantics instead of prose.
//
// Auth emulation: Postgres RPCs use auth.uid(); here every call takes { userId } explicitly.
// Locking: Postgres uses SELECT ... FOR UPDATE; SQLite is single-writer, so each RPC runs
// inside one IMMEDIATE transaction, which gives the same serialisation.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SCHEMA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function openDb(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function makeInviteCode(rng = () => randomInt(CODE_ALPHABET.length)) {
  let s = "PLUSH-";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[rng()];
  return s;
}

// Mirrors is_valid_state(jsonb) in docs/data-model.md §1. Accepts schema versions 1-3 so the
// harness is usable before phase 3 lands; Postgres should accept the current version only.
export function isValidState(state) {
  if (!state || typeof state !== "object") return false;
  if (![1, 2, 3].includes(state.version)) return false;
  const needs = state.needs;
  if (!needs) return false;
  for (const n of ["fullness", "fun", "love", "energy"]) {
    const v = needs[n];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return false;
  }
  if (typeof state.asleep !== "boolean") return false;
  const c = state.bites?.count;
  if (!Number.isInteger(c) || c < 0 || c > 20) return false;
  if (state.version === 3) {
    const lvl = state.progress?.level;
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 10) return false;
  }
  return true;
}

function iso(ms) { return new Date(ms).toISOString(); }

function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

function member(db, userId) {
  return db.prepare("SELECT user_id, home_id, partner_id FROM members WHERE user_id = ?").get(userId) ?? null;
}
export const myHomeId = (db, userId) => member(db, userId)?.home_id ?? null;

function stateRow(db, homeId) {
  const r = db.prepare("SELECT version, state FROM plush_state WHERE home_id = ?").get(homeId);
  return r ? { version: Number(r.version), state: JSON.parse(r.state) } : null;
}

function insertEvent(db, { id, homeId, partnerId, type, version, clientAt, payload, stateAfter }) {
  db.prepare(`INSERT INTO plush_events (id, home_id, partner_id, type, version, client_at, payload, state_after)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, homeId, partnerId, type, version, iso(clientAt), JSON.stringify(payload ?? {}), JSON.stringify(stateAfter));
  return eventById(db, id);
}

function eventById(db, id) {
  const r = db.prepare("SELECT * FROM plush_events WHERE id = ?").get(id);
  return r && rowToEvent(r);
}
function rowToEvent(r) {
  return { ...r, version: Number(r.version), payload: JSON.parse(r.payload), state_after: JSON.parse(r.state_after) };
}

// Bump state + record an event in one step. Used by create/join/reset and commit.
function advance(db, { homeId, partnerId, type, clientAt, payload, newState, eventId = randomUUID() }) {
  const cur = stateRow(db, homeId);
  const version = cur.version + 1;
  db.prepare("UPDATE plush_state SET state = ?, version = ?, updated_at = ? WHERE home_id = ?")
    .run(JSON.stringify(newState), version, iso(clientAt), homeId);
  const event = insertEvent(db, { id: eventId, homeId, partnerId, type, version, clientAt, payload, stateAfter: newState });
  return { state: newState, version, event };
}

/** RPC server_now() */
export function serverNow(db, { now = Date.now() } = {}) { return now; }

/** RPC create_home(p_name, p_color, p_initial_state, p_timezone) */
export function createHome(db, { userId, name, color, initialState, timezone = "UTC", now = Date.now(), broughtLocal = false }) {
  return tx(db, () => {
    if (member(db, userId)) throw rpcError("already_member");
    if (!isValidState(initialState)) throw rpcError("invalid");
    const homeId = randomUUID();
    let code;
    for (let attempt = 0; ; attempt++) {
      code = makeInviteCode();
      try { db.prepare("INSERT INTO homes (id, invite_code, timezone) VALUES (?, ?, ?)").run(homeId, code, timezone); break; }
      catch (e) { if (attempt > 5 || !/UNIQUE/.test(String(e))) throw e; }
    }
    const partnerId = randomUUID();
    db.prepare("INSERT INTO partners (id, home_id, name, color) VALUES (?, ?, ?, ?)").run(partnerId, homeId, name, color);
    db.prepare("INSERT INTO members (user_id, home_id, partner_id) VALUES (?, ?, ?)").run(userId, homeId, partnerId);
    db.prepare("INSERT INTO plush_state (home_id, version, state, updated_at) VALUES (?, 0, ?, ?)").run(homeId, JSON.stringify(initialState), iso(now));
    let r = advance(db, { homeId, partnerId, type: "join", clientAt: now, payload: { name, color }, newState: initialState });
    if (broughtLocal) r = advance(db, { homeId, partnerId, type: "migrate", clientAt: now, payload: { from: "local" }, newState: initialState });
    return { home_id: homeId, invite_code: code, partner_id: partnerId, state: r.state, version: r.version };
  });
}

/** RPC join_home(p_code, p_name, p_color) */
export function joinHome(db, { userId, code, name, color, now = Date.now() }) {
  return tx(db, () => {
    const existing = member(db, userId);
    if (existing) {
      const r = stateRow(db, existing.home_id);
      const home = db.prepare("SELECT id, invite_code FROM homes WHERE id = ?").get(existing.home_id);
      return { home_id: home.id, invite_code: home.invite_code, partner_id: existing.partner_id, state: r.state, version: r.version, existing: true };
    }
    const home = db.prepare("SELECT id, invite_code FROM homes WHERE upper(invite_code) = upper(?)").get(code);
    if (!home) throw rpcError("not_found");
    let partner = db.prepare("SELECT id FROM partners WHERE home_id = ? AND name = ?").get(home.id, name);
    let partnerId = partner?.id;
    if (!partnerId) {
      partnerId = randomUUID();
      try { db.prepare("INSERT INTO partners (id, home_id, name, color) VALUES (?, ?, ?, ?)").run(partnerId, home.id, name, color); }
      catch (e) { if (/home_full/.test(String(e))) throw rpcError("home_full"); throw e; }
    }
    db.prepare("INSERT INTO members (user_id, home_id, partner_id) VALUES (?, ?, ?)").run(userId, home.id, partnerId);
    const cur = stateRow(db, home.id);
    const r = advance(db, { homeId: home.id, partnerId, type: "join", clientAt: now, payload: { name, color }, newState: cur.state });
    return { home_id: home.id, invite_code: home.invite_code, partner_id: partnerId, state: r.state, version: r.version };
  });
}

/** RPC commit_action(...) — the CAS write. See docs/phase-2-shared-sync.md §5.1. */
export function commitAction(db, { userId, eventId, type, clientAt, expectedVersion, newState, payload = {}, now = Date.now() }) {
  return tx(db, () => {
    const m = member(db, userId);
    if (!m) throw rpcError("not_member");
    const cur = stateRow(db, m.home_id);                       // row is locked by the IMMEDIATE tx
    if (Math.abs(now - clientAt) > CLOCK_SKEW_MS) return { ok: false, code: "clock", state: cur.state, version: cur.version };
    const dup = eventById(db, eventId);
    if (dup) return { ok: true, code: "duplicate", state: cur.state, version: cur.version, event: dup };
    if (cur.version !== expectedVersion) return { ok: false, code: "version", state: cur.state, version: cur.version };
    if (!isValidState(newState)) return { ok: false, code: "invalid", state: cur.state, version: cur.version };
    const r = advance(db, { homeId: m.home_id, partnerId: m.partner_id, type, clientAt, payload, newState, eventId });
    return { ok: true, ...r };
  });
}

/** RPC reset_home(p_new_state) */
export function resetHome(db, { userId, newState, now = Date.now() }) {
  return tx(db, () => {
    const m = member(db, userId);
    if (!m) throw rpcError("not_member");
    if (!isValidState(newState)) throw rpcError("invalid");
    const r = advance(db, { homeId: m.home_id, partnerId: m.partner_id, type: "reset", clientAt: now, payload: {}, newState });
    return { state: r.state, version: r.version };
  });
}

/** RPC leave_home() */
export function leaveHome(db, { userId }) {
  db.prepare("DELETE FROM members WHERE user_id = ?").run(userId);
}

/** RPC home_snapshot() */
export function homeSnapshot(db, { userId, limit = 30 }) {
  const m = member(db, userId);
  if (!m) return null;
  const home = db.prepare("SELECT * FROM homes WHERE id = ?").get(m.home_id);
  const partners = db.prepare("SELECT id, name, color FROM partners WHERE home_id = ? ORDER BY created_at").all(m.home_id);
  const s = stateRow(db, m.home_id);
  const events = db.prepare("SELECT * FROM plush_events WHERE home_id = ? ORDER BY version DESC LIMIT ?").all(m.home_id, limit).map(rowToEvent);
  return { home, partners, me: { user_id: userId, partner_id: m.partner_id }, state: s.state, version: s.version, events };
}

/** Emulates the RLS select policy: rows visible to userId for a table with home_id. */
export function selectAsUser(db, { userId, table }) {
  const homeId = myHomeId(db, userId);
  if (!homeId) return [];
  return db.prepare(`SELECT * FROM ${table} WHERE home_id = ?`).all(homeId);
}

function rpcError(code) { const e = new Error(code); e.code = code; return e; }
