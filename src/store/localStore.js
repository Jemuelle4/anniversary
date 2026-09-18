import { migrate } from "../game/state.js";
import { eventRowFrom } from "./store.js";

export const LOCAL_KEYS = { state: "plush.v1.state", events: "plush.v1.events", meta: "plush.v1.meta", migrated: "plush.v1.state.migrated", memories: "plush.v1.memories" };
const LOCAL_PARTNER = { id: "local", name: "You", color: "beige" };
const MAX_EVENTS = 30;

function defaultTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }

/** Store over localStorage (phase 1). `storage` is injectable for tests; falls back to memory. */
export class LocalStore {
  constructor({ storage, now = () => Date.now(), onStorageError } = {}) {
    this.storage = storage ?? safeLocalStorage();
    this.now = now;
    this.onStorageError = onStorageError ?? (() => {});
    this.memory = new Map();
    this.version = 0;
    this.events = [];
    this.meta = null;
  }
  get(key) {
    try { const v = this.storage?.getItem(key); if (v != null) return v; } catch (e) { this.onStorageError(e); }
    return this.memory.get(key) ?? null;
  }
  set(key, value) {
    this.memory.set(key, value);
    try { this.storage?.setItem(key, value); } catch (e) { this.onStorageError(e); }
  }
  del(key) { this.memory.delete(key); try { this.storage?.removeItem(key); } catch (e) { this.onStorageError(e); } }
  readJson(key) { try { const v = this.get(key); return v ? JSON.parse(v) : null; } catch { return null; } }

  async load() {
    const raw = this.readJson(LOCAL_KEYS.state);
    if (!raw) return null;
    const meta = this.readJson(LOCAL_KEYS.meta) ?? {};
    this.meta = { timezone: meta.timezone ?? defaultTz(), anniversary_date: meta.anniversary_date ?? null, partner: { ...LOCAL_PARTNER, ...(meta.partner ?? {}) }, version: meta.version ?? 0 };
    this.version = this.meta.version;
    this.events = Array.isArray(this.readJson(LOCAL_KEYS.events)) ? this.readJson(LOCAL_KEYS.events) : [];
    return this.snapshot(migrate(raw, this.now()));
  }
  snapshot(state) {
    const m = this.meta ?? { timezone: defaultTz(), anniversary_date: null, partner: LOCAL_PARTNER };
    return { state, version: this.version, partners: [m.partner], me: { partner_id: m.partner.id }, events: [...this.events], home: { timezone: m.timezone, anniversary_date: m.anniversary_date, invite_code: null } };
  }
  /** Create the local home with a given initial state (phase 1 first run). */
  async init(state) {
    this.meta = { timezone: defaultTz(), anniversary_date: null, partner: { ...LOCAL_PARTNER }, version: 0 };
    this.version = 0; this.events = [];
    this.persist(state);
    return this.snapshot(state);
  }
  persist(state) {
    this.set(LOCAL_KEYS.state, JSON.stringify(state));
    this.set(LOCAL_KEYS.events, JSON.stringify(this.events.slice(0, MAX_EVENTS)));
    this.set(LOCAL_KEYS.meta, JSON.stringify({ ...this.meta, version: this.version }));
  }
  async save(state) { this.persist(state); }
  async commit(pending) {
    if (!this.meta) await this.init(pending.newState);
    this.version += 1;
    const event = eventRowFrom(pending, { partnerId: this.meta.partner.id, version: this.version, createdAt: this.now() });
    this.events.unshift(event);
    this.events = this.events.slice(0, MAX_EVENTS);
    this.persist(pending.newState);
    return { ok: true, state: pending.newState, version: this.version, event };
  }
  async clear(newState) {
    this.version += 1;
    this.events.unshift(eventRowFrom({ id: `reset-${this.version}`, type: "reset", clientAt: this.now(), payload: {}, newState }, { partnerId: this.meta?.partner.id ?? "local", version: this.version, createdAt: this.now() }));
    this.persist(newState);
  }
  subscribe() { return () => {}; }
  async updateHome(patch) { this.meta = { ...this.meta, ...patch }; this.set(LOCAL_KEYS.meta, JSON.stringify({ ...this.meta, version: this.version })); }
  async updatePartner(patch) { this.meta.partner = { ...this.meta.partner, ...patch }; this.set(LOCAL_KEYS.meta, JSON.stringify({ ...this.meta, version: this.version })); }
  /** Used by pairing: hand the local state to a new home and stop reading it. */
  takeForMigration() {
    const raw = this.readJson(LOCAL_KEYS.state);
    if (!raw) return null;
    this.set(LOCAL_KEYS.migrated, JSON.stringify(raw));
    this.del(LOCAL_KEYS.state);
    return migrate(raw, this.now());
  }
  hasLocalState() { return !!this.readJson(LOCAL_KEYS.state); }

  // ---- memories (local mode keeps them on the device; photos are data URLs) ----
  memories() { const m = this.readJson(LOCAL_KEYS.memories); return Array.isArray(m) ? m : []; }
  async listMemories({ before = null, limit = 20 } = {}) {
    let list = this.memories().sort((a, b) => Date.parse(b.happened_at) - Date.parse(a.happened_at));
    if (before) list = list.filter((m) => Date.parse(m.happened_at) < Date.parse(before));
    return list.slice(0, limit);
  }
  async addMemory({ kind, key = null, caption = null, photoPath = null, happenedAt = null }) {
    const list = this.memories();
    if (key && list.some((m) => m.key === key)) return list.find((m) => m.key === key);
    const row = { id: `m-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, kind, key, caption, photo_path: photoPath, partner_id: kind === "moment" ? this.meta?.partner.id ?? "local" : null, happened_at: new Date(happenedAt ?? this.now()).toISOString(), created_at: new Date(this.now()).toISOString() };
    list.push(row); this.set(LOCAL_KEYS.memories, JSON.stringify(list)); return row;
  }
  async deleteMemory(id) { this.set(LOCAL_KEYS.memories, JSON.stringify(this.memories().filter((m) => m.id !== id))); }
  async uploadPhoto(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
  async signedUrl(path) { return path; }
}

function safeLocalStorage() {
  try { const s = globalThis.localStorage; s.getItem("plush.probe"); return s; } catch { return null; }
}
