// Store over Supabase: RPC-only writes, Realtime for partner events (docs/phase-2).
import { ensureAnonSession } from "../sync/client.js";

export class SupabaseStore {
  constructor(client, { clock } = {}) {
    this.client = client;
    this.clock = clock;
    this.homeId = null;
    this.partnerId = null;
    this.userId = null;
    this.channel = null;
    this.paused = false;
  }
  async session() {
    const s = await ensureAnonSession(this.client);
    this.userId = s.user.id;
    return s;
  }
  async rpc(name, params = {}) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) { const e = new Error(error.message); e.code = error.code ?? error.message; e.status = error.status; throw e; }
    return data;
  }
  async serverNow() { const d = await this.rpc("server_now"); return Date.parse(d); }

  async load() {
    await this.session();
    const snap = await this.rpc("home_snapshot");
    if (!snap) return null;
    this.homeId = snap.home.id; this.partnerId = snap.me.partner_id;
    return { state: snap.state, version: Number(snap.version), partners: snap.partners, me: snap.me, events: snap.events ?? [], home: snap.home };
  }
  async createHome({ name, color, initialState, timezone, broughtLocal }) {
    await this.session();
    const r = await this.rpc("create_home", { p_name: name, p_color: color, p_initial_state: initialState, p_timezone: timezone, p_brought_local: !!broughtLocal });
    return r;
  }
  async joinHome({ code, name, color }) {
    await this.session();
    return this.rpc("join_home", { p_code: code, p_name: name, p_color: color });
  }
  async commit(ev) {
    const r = await this.rpc("commit_action", { p_event_id: ev.id, p_type: ev.type, p_client_at: new Date(ev.clientAt).toISOString(), p_expected_version: ev.expectedVersion, p_new_state: ev.newState, p_payload: ev.payload ?? {} });
    return { ...r, version: Number(r.version) };
  }
  async clear(newState) { await this.rpc("reset_home", { p_new_state: newState }); }
  async leave() { await this.rpc("leave_home"); this.homeId = null; }
  async updateHome(patch) { return this.rpc("update_home", { p_timezone: patch.timezone ?? null, p_anniversary_date: patch.anniversary_date ?? null }); }
  async updatePartner(patch) { return this.rpc("update_partner", { p_name: patch.name ?? null, p_color: patch.color ?? null }); }

  subscribe(cb) {
    if (!this.homeId) return () => {};
    const ch = this.client.channel(`home:${this.homeId}`, { config: { presence: { key: this.userId } } });
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "plush_events", filter: `home_id=eq.${this.homeId}` }, (payload) => cb({ kind: "event", event: payload.new }));
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const online = new Set();
      for (const key of Object.keys(state)) for (const p of state[key]) if (p.partnerId) online.add(p.partnerId);
      cb({ kind: "presence", partnersOnline: [...online] });
    });
    ch.subscribe((status) => {
      cb({ kind: "connection", online: status === "SUBSCRIBED", status });
      if (status === "SUBSCRIBED") ch.track({ partnerId: this.partnerId, at: Date.now() });
    });
    this.channel = ch;
    return () => { try { this.client.removeChannel(ch); } catch {} this.channel = null; };
  }

  // ---- memories (phase 3) ----
  async listMemories({ before = null, limit = 20 } = {}) { return this.rpc("list_memories", { p_before: before, p_limit: limit }); }
  async addMemory({ kind, key = null, caption = null, photoPath = null, happenedAt = null }) {
    return this.rpc("add_memory", { p_kind: kind, p_key: key, p_caption: caption, p_photo_path: photoPath, p_happened_at: happenedAt ? new Date(happenedAt).toISOString() : null });
  }
  async deleteMemory(id, photoPath) {
    if (photoPath) await this.client.storage.from("memories").remove([photoPath]);
    return this.rpc("delete_memory", { p_id: id });
  }
  async uploadPhoto(blob, id) {
    const path = `${this.homeId}/${id}.jpg`;
    const { error } = await this.client.storage.from("memories").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  }
  async signedUrl(path) {
    const { data, error } = await this.client.storage.from("memories").createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  // ---- push (phase 4) ----
  async savePushSubscription(sub, { quietStart = 22, quietEnd = 8 } = {}) {
    const json = sub.toJSON();
    const { error } = await this.client.from("push_subscriptions").upsert({ user_id: this.userId, home_id: this.homeId, partner_id: this.partnerId, endpoint: json.endpoint, keys: json.keys, quiet_start: quietStart, quiet_end: quietEnd }, { onConflict: "endpoint" });
    if (error) throw error;
  }
  async deletePushSubscription(endpoint) {
    const { error } = await this.client.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  }
}

/** Classify a load() failure for the error UI (docs/phase-4 §5). */
export function classifyError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/paused|project.*not.*active|503|502|540/.test(msg) || err?.status >= 500) return "paused";
  if (/failed to fetch|network|load failed|fetch/.test(msg)) return "offline";
  return "unknown";
}
