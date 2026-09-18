// Plush page controller (docs/phase-1 §10, phase-2 §7, phase-3, phase-4).
import config from "../config.js";
import { applyAction, effectsFor } from "./game/actions.js";
import { applyDecay, normalize } from "./game/decay.js";
import { createInitialState, migrate } from "./game/state.js";
import { moodFor } from "./game/mood.js";
import { levelTitle } from "./game/progress.js";
import { TOASTS, RITUAL_LABELS, verbFor } from "./game/copy.js";
import { dayKey, safeTz } from "./game/time.js";
import { LocalStore } from "./store/localStore.js";
import { SupabaseStore, classifyError } from "./store/supabaseStore.js";
import { uuid } from "./store/store.js";
import { getClient, hasSupabaseConfig } from "./sync/client.js";
import { createClock } from "./sync/clock.js";
import { Syncer } from "./sync/syncer.js";
import { createStage } from "./ui/stage.js";
import { createHud } from "./ui/hud.js";
import { createDock } from "./ui/dock.js";
import { createToast } from "./ui/toast.js";
import { openMenu } from "./ui/menu.js";
import { openPairing } from "./ui/pairing.js";
import { openSheet, el } from "./ui/sheet.js";
import { pushSupported, isIosNotInstalled, subscribePush, currentSubscription } from "./ui/push.js";

export const CACHE_KEY = "plush.v2.cache";
const TICK_MS = 30_000;

export function chooseMode() {
  const params = new URLSearchParams(location.search);
  if (params.get("local") === "1") return "local";
  if (globalThis.__plushClientFactory) return "supabase"; // test hook (tests/e2e)
  if (!hasSupabaseConfig(config)) return "local";
  return "supabase";
}
export function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }

export class PetController {
  constructor(root) {
    this.root = root;
    this.mode = chooseMode();
    this.clock = createClock(null);
    this.stage = createStage(root.querySelector("#stage"));
    this.hud = createHud(root.querySelector("#hud"));
    this.toast = createToast(root.querySelector("#toast"));
    this.dock = createDock(root.querySelector("#dock"), { onAction: (t) => this.dispatch(t), now: () => this.now() });
    this.presenceEl = root.querySelector("#presence");
    this.connEl = root.querySelector("#conn");
    this.overlay = root.querySelector("#overlay");
    root.querySelector("#menuBtn").addEventListener("click", () => openMenu({ ctl: this }));
    this.snapshot = null; this.state = null; this.version = 0; this.syncer = null; this.unsub = null;
    this.partnersOnline = []; this.online = true; this.pushSub = null; this.celebratedYear = null;
  }
  now() { return this.clock.now(); }
  tz() { return safeTz(this.snapshot?.home?.timezone ?? "UTC"); }
  me() { return this.snapshot?.partners?.find((p) => p.id === this.snapshot.me.partner_id) ?? null; }
  ctx() { return { partnerId: this.snapshot?.me?.partner_id ?? null, timezone: this.tz() }; }

  /* ---------- boot ---------- */
  async boot() {
    if (this.mode === "local") return this.bootLocal();
    return this.bootSupabase();
  }
  async bootLocal() {
    this.store = new LocalStore({ now: () => this.now(), onStorageError: () => this.oncePrivateToast() });
    let snap = await this.store.load();
    if (!snap) snap = await this.store.init(createInitialState(this.now()));
    this.adopt(snap); this.afterBoot();
  }
  async bootSupabase() {
    const cached = readCache();
    if (cached?.state) { this.snapshot = cached; this.state = migrate(cached.state, this.now()); this.version = cached.version ?? 0; this.render(); }
    try {
      const client = await getClient(config);
      this.store = new SupabaseStore(client);
      this.clock = createClock(() => this.store.serverNow());
      await this.clock.sync();
      let snap = await this.store.load();
      if (!snap) snap = await this.pair();
      this.adopt(snap); this.hideError(); this.afterBoot();
    } catch (e) {
      console.error(e);
      const kind = classifyError(e);
      if (kind === "paused") this.showError("Plush is napping on the server", "The database is paused. Try again in a minute.", () => this.bootSupabase());
      else if (!cached) this.showError("Plush needs internet the first time", "Connect and try again.", () => this.bootSupabase());
      else { this.online = false; this.renderPills(); }
    }
  }
  async pair() {
    const local = new LocalStore({ now: () => this.now() });
    const params = new URLSearchParams(location.search);
    const joinCode = params.get("join") ?? "";
    const r = await openPairing({
      store: this.store, joinCode, welcomeBack: !!readCache(),
      hasLocalState: local.hasLocalState(), takeLocalState: () => local.takeForMigration(),
      initialState: () => createInitialState(this.now()), timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })(),
    });
    if (joinCode) history.replaceState(null, "", location.pathname);
    const snap = await this.store.load();
    if (!snap) throw new Error("pairing failed");
    this.toast.show(r.existing ? "Welcome back." : "Welcome home.");
    return snap;
  }
  adopt(snap) {
    this.snapshot = snap; this.version = snap.version;
    this.state = applyDecay(migrate(snap.state, this.now()), this.now(), this.ctx());
    delete this.state.autoWoke;
    this.writeCache(); this.render();
  }
  afterBoot() {
    this.syncer = new Syncer({
      store: this.store, now: () => this.now(), ctx: () => this.ctx(),
      onServerState: (state, version, event, rebased) => this.onServerState(state, version, event, rebased),
      onDropped: (ev, reason) => this.toast.show(`Your ${ev.type} didn't go through: ${(TOASTS[`${ev.type}.${reason}`] ?? reason).toLowerCase()}`),
      onStatus: (online, pending) => { this.online = online; this.pending = pending; this.renderPills(); },
      onClockReject: async () => { await this.clock.sync(); this.toast.show(TOASTS["clock.off"]); },
      onInvalid: async () => { this.toast.show(TOASTS["sync.reloaded"]); await this.reload(false); },
    });
    if (this.syncer.outbox.length) this.syncer.flush();
    this.unsub = this.store.subscribe((m) => this.onMessage(m));
    setInterval(() => this.tick(), TICK_MS);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { this.tick(); if (this.mode === "supabase") this.reload(false); } });
    window.addEventListener("online", () => this.syncer.goOnline());
    if (this.mode === "supabase") { setTimeout(() => { if (!this.subscribed) this.reload(false); }, 5000); this.initPushState(); }
    this.checkAnniversary();
  }

  /* ---------- rendering ---------- */
  render() {
    if (!this.state) return;
    const now = this.now();
    this.hud.render(this.state, this.snapshot, now);
    this.dock.render(this.state);
    this.stage.render(this.state, { anniversary: this.isAnniversaryToday() });
    this.stage.thought(moodFor(this.state).thought);
    this.renderPills();
  }
  renderPills() {
    const other = this.snapshot?.partners?.find((p) => p.id !== this.snapshot.me.partner_id);
    const here = other && this.partnersOnline.includes(other.id);
    this.presenceEl.hidden = !here;
    if (here) this.presenceEl.innerHTML = `<span class="sw sw-${other.color}"></span>${escape(other.name)} is here`;
    const pending = this.pending ?? 0;
    const show = this.mode === "supabase" && (!this.online || pending > 0);
    this.connEl.hidden = !show;
    if (show) this.connEl.textContent = !this.online ? `offline${pending ? ` · ${pending} waiting` : ""}` : `syncing · ${pending}`;
    this.connEl.classList.toggle("warn", !this.online);
  }
  tick() {
    if (!this.state) return;
    const next = applyDecay(this.state, this.now(), this.ctx());
    const woke = next.autoWoke; delete next.autoWoke;
    this.state = next;
    if (woke) { this.stage.play(["anim:wake"], this.state); this.persistDerived(); }
    this.render();
  }
  /** Auto-wake or rollover changed the state without an action: store it so the partner sees it. */
  persistDerived() {
    if (this.mode === "local") this.store.save(normalize(this.state));
  }

  /* ---------- actions ---------- */
  async dispatch(type) {
    const now = this.now();
    const r = applyAction(this.state, type, now, this.ctx());
    if (!r.ok) {
      this.state = r.state; this.render();
      this.toast.show(TOASTS[`${type}.${r.reason}`] ?? "Not right now.");
      if (r.reason === "asleep") return this.dispatch("wake");
      return;
    }
    const prev = this.state;
    const event = { id: uuid(), type, clientAt: now, expectedVersion: this.version, newState: r.state, payload: r.effects.includes("bites:respawn") ? { seed: r.state.bites.seed } : {} };
    this.state = r.state; this.version += 1;
    this.snapshot.events = [{ id: event.id, partner_id: this.snapshot.me.partner_id, type, version: this.version, client_at: new Date(now).toISOString(), created_at: new Date(now).toISOString(), payload: event.payload, state_after: r.state }, ...this.snapshot.events].slice(0, 30);
    this.writeCache();
    this.playEffects(r.effects, { local: true });
    this.render();
    this.afterEffects(prev, r.effects);
    this.syncer.push(event);
  }
  playEffects(effects, { local }) {
    const busy = this.stage.play(effects, this.state);
    if (local) this.dock.busy(busy);
    for (const tag of effects) {
      const [kind, name] = tag.split(":");
      if (kind === "toast" && local) this.toast.show(TOASTS[name]);
      if (kind === "ritual") this.toast.show(`${RITUAL_LABELS[name]} done${local ? "" : ` · ${this.lastActorName()}`}`);
      if (tag === "celebrate:level") this.toast.show(`Plush grew! Lv ${this.state.progress.level} · ${levelTitle(this.state.progress.level)} Plush`);
      if (tag === "celebrate:streak") this.toast.show(`${this.state.progress.streak.count} days of looking after Plush together`);
      if (tag === "toast:streak.freeze" && !local) this.toast.show(TOASTS["streak.freeze"]);
    }
  }
  lastActorName() { const p = this.snapshot.partners.find((x) => x.id === this.state.lastAction?.by); return p?.name ?? "someone"; }
  /** Auto memories for milestones (deduped server-side by key). */
  async afterEffects(prev, effects) {
    const p = this.state.progress;
    const who = this.me()?.name ?? "Someone";
    try {
      if (effects.includes("celebrate:level")) await this.store.addMemory({ kind: "level", key: `level:${p.level}`, caption: `Plush became ${levelTitle(p.level)} Plush`, happenedAt: this.now() });
      if (effects.includes("celebrate:streak")) await this.store.addMemory({ kind: "streak", key: `streak:${p.streak.count}`, caption: `${p.streak.count} days of looking after Plush together`, happenedAt: this.now() });
      if (effects.includes("bites:respawn")) await this.store.addMemory({ kind: "eaten", key: `eaten:${this.state.counters.eaten}`, caption: `${who} ate Plush. Plush came back.`, happenedAt: this.now() });
    } catch (e) { console.warn("memory", e); }
  }
  async reset() {
    const fresh = createInitialState(this.now());
    try { await this.store.clear(fresh); } catch (e) { this.toast.show("Couldn't reset: " + e.message); return; }
    await this.reload(true);
    this.toast.show(TOASTS["reset.done"]);
  }
  async reload(animate) {
    try {
      const snap = await this.store.load(); if (!snap) return;
      this.snapshot = snap;
      if (snap.version !== this.version || !animate) { this.version = snap.version; this.state = applyDecay(migrate(snap.state, this.now()), this.now(), this.ctx()); delete this.state.autoWoke; }
      const r = this.syncer?.rebaseOn(this.state, this.version); if (r) { this.state = r.state; this.version = r.version; }
      this.writeCache(); this.render();
      if (animate) this.stage.spawn && this.stage.render(this.state);
    } catch (e) { console.warn("reload", e); }
  }

  /* ---------- sync callbacks ---------- */
  onServerState(state, version, event, rebased) {
    if (version >= this.version || rebased) {
      if (rebased) { this.state = applyDecay(migrate(state, this.now()), this.now(), this.ctx()); delete this.state.autoWoke; }
      this.version = Math.max(this.version, version);
    }
    this.writeCache(); this.render();
  }
  onMessage(m) {
    if (m.kind === "connection") {
      const was = this.subscribed; this.subscribed = m.online;
      if (m.online && was === false) this.reload(false);
      return;
    }
    if (m.kind === "presence") { this.partnersOnline = m.partnersOnline; this.renderPills(); return; }
    if (m.kind === "event") this.onRemoteEvent(m.event);
  }
  onRemoteEvent(row) {
    if (this.syncer.isMine(row.id) || row.partner_id === this.snapshot.me.partner_id) return;
    const version = Number(row.version);
    if (version <= this.version) return;
    if (version !== this.version + 1) return this.reload(false);
    const prev = this.state;
    const after = migrate(row.state_after, this.now());
    let state = applyDecay(after, this.now(), this.ctx()); delete state.autoWoke;
    const r = this.syncer.rebaseOn(state, version);
    this.state = r.state; this.version = r.version;
    this.snapshot.events = [row, ...this.snapshot.events].slice(0, 30);
    if (row.type === "join" || row.type === "settings") this.reload(false);
    const effects = effectsFor(prev, row);
    const who = this.snapshot.partners.find((p) => p.id === row.partner_id);
    this.playEffects(effects, { local: false });
    if (who) { this.stage.chip(who.name, who.color); this.toast.show(`${who.name} ${verbFor(row)}`); }
    this.writeCache(); this.render();
  }

  /* ---------- settings / home ---------- */
  async updatePartner(patch) { await this.store.updatePartner(patch); await this.reload(false); }
  async updateHome(patch) { await this.store.updateHome(patch); await this.reload(false); this.checkAnniversary(); }
  async leaveHome() { await this.store.leave(); localStorage.removeItem(CACHE_KEY); location.reload(); }
  showInvite() {
    const code = this.snapshot.home.invite_code; const url = `${location.origin}${location.pathname}?join=${code}`;
    const copy = el("button", { class: "btn ghost", type: "button", text: "Copy", onclick: async () => { try { await navigator.clipboard.writeText(code); copy.textContent = "Copied"; } catch {} } });
    const share = navigator.share ? el("button", { class: "btn primary", type: "button", text: "Share", onclick: () => navigator.share({ text: `Come look after Plush with me: ${url}` }).catch(() => {}) }) : null;
    openSheet({ title: "Invite code", content: el("div", {}, [el("div", { class: "code", text: code }), el("div", { class: "actions" }, [share, copy])]) });
  }

  /* ---------- anniversary ---------- */
  isAnniversaryToday() {
    const d = this.snapshot?.home?.anniversary_date; if (!d) return false;
    return dayKey(this.now(), this.tz()).slice(5) === d.slice(5);
  }
  anniversaryYears() { const d = this.snapshot.home.anniversary_date; return Number(dayKey(this.now(), this.tz()).slice(0, 4)) - Number(d.slice(0, 4)); }
  async checkAnniversary() {
    const d = this.snapshot?.home?.anniversary_date; if (!d) { this.stage.banner(null); return; }
    const today = dayKey(this.now(), this.tz());
    if (this.isAnniversaryToday()) {
      const years = this.anniversaryYears();
      this.stage.banner(`Happy ${years} Year Anniversary!`);
      const flag = `plush.celebrated.${today.slice(0, 4)}`;
      if (!localStorage.getItem(flag)) {
        try { localStorage.setItem(flag, "1"); } catch {}
        setTimeout(() => this.stage.celebrate(), 600);
        try { await this.store.addMemory({ kind: "anniversary", key: `anniversary:${today.slice(0, 4)}`, caption: `Year ${years} together`, happenedAt: this.now() }); } catch {}
      }
    } else {
      this.stage.banner(null);
      if (today.slice(8) === d.slice(8) && today.slice(5) !== d.slice(5)) this.toast.show("Happy monthiversary.");
    }
  }

  /* ---------- push ---------- */
  pushSupported() { return this.mode === "supabase" && pushSupported(config); }
  pushEnabled() { return !!this.pushSub; }
  isIosNotInstalled() { return isIosNotInstalled(); }
  async initPushState() { try { if (this.pushSupported()) this.pushSub = await currentSubscription(); } catch {} }
  async setPush(on) {
    if (on) { const sub = await subscribePush(config); await this.store.savePushSubscription(sub); this.pushSub = sub; }
    else if (this.pushSub) { const endpoint = this.pushSub.endpoint; await this.pushSub.unsubscribe(); await this.store.deletePushSubscription(endpoint); this.pushSub = null; }
  }

  /* ---------- misc ---------- */
  writeCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...this.snapshot, state: this.state, version: this.version, events: (this.snapshot?.events ?? []).slice(0, 30) })); } catch {} }
  oncePrivateToast() { if (this.privateToasted) return; this.privateToasted = true; this.toast.show(TOASTS["private.mode"]); }
  showError(title, text, retry) {
    this.overlay.hidden = false;
    this.overlay.innerHTML = "";
    this.overlay.appendChild(el("div", { class: "card" }, [el("h2", { text: title }), el("p", { text }), el("button", { class: "btn primary", type: "button", text: "Retry", onclick: () => { this.hideError(); retry(); } })]));
  }
  hideError() { this.overlay.hidden = true; }
}
function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
