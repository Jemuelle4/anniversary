// Drives the outbox through store.commit with backoff and rebase. Browser-side glue around outbox.js.
import { enqueue, rebase, remove } from "./outbox.js";

export const OUTBOX_KEY = "plush.v2.outbox";

export class Syncer {
  /**
   * @param {object} o
   * @param {import('../store/store.js').Store} o.store
   * @param {() => number} o.now
   * @param {() => object} o.ctx          // { partnerId, timezone }
   * @param {(state, version) => void} o.onServerState   // adopt after ok/rebase
   * @param {(event, reason) => void} o.onDropped
   * @param {(online: boolean, pending: number) => void} o.onStatus
   * @param {() => Promise<void>} [o.onClockReject]
   * @param {() => Promise<void>} [o.onInvalid]
   * @param {Storage} [o.storage]
   */
  constructor(o) {
    Object.assign(this, o);
    this.storage = o.storage ?? safeStorage();
    this.outbox = this.read();
    this.flushing = false;
    this.backoff = 1000;
    this.timer = null;
    this.online = true;
    this.done = new Set();
  }
  read() { try { const v = this.storage?.getItem(OUTBOX_KEY); return v ? JSON.parse(v) : []; } catch { return []; } }
  write() { try { this.storage?.setItem(OUTBOX_KEY, JSON.stringify(this.outbox)); } catch {} }
  status() { this.onStatus?.(this.online, this.outbox.length); }
  isMine(id) { return this.done.has(id) || this.outbox.some((e) => e.id === id); }

  push(event) { this.outbox = enqueue(this.outbox, event); this.write(); this.status(); this.flush(); }

  /** A remote event arrived: rebase pending events on top of the new server state. */
  rebaseOn(state, version) {
    if (!this.outbox.length) return { state, version };
    const r = rebase(this.outbox, state, version, this.now(), this.ctx());
    this.outbox = r.outbox; this.write();
    for (const d of r.dropped) this.onDropped?.(d.event, d.reason);
    this.status();
    return { state: r.state, version: r.version };
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const ev = this.outbox[0];
        let res;
        try { res = await this.store.commit(ev); }
        catch (err) { this.online = false; this.status(); this.schedule(); return; }
        this.online = true; this.backoff = 1000;
        if (res.ok) {
          this.outbox = remove(this.outbox, ev.id); this.done.add(ev.id); this.write();
          this.onServerState?.(res.state, res.version, res.event, res.code === "duplicate");
        } else if (res.code === "version") {
          const r = rebase(this.outbox, res.state, res.version, this.now(), this.ctx());
          this.outbox = r.outbox; this.write();
          for (const d of r.dropped) this.onDropped?.(d.event, d.reason);
          this.onServerState?.(r.state, r.version, null, true);
          if (!this.outbox.length) this.onServerState?.(res.state, res.version, null, true);
        } else if (res.code === "clock") {
          if (ev.clockRetried) { this.outbox = remove(this.outbox, ev.id); this.write(); this.onDropped?.(ev, "clock"); continue; }
          await this.onClockReject?.();
          this.outbox = this.outbox.map((e) => (e.id === ev.id ? { ...e, clientAt: this.now(), clockRetried: true } : e)); this.write();
        } else {
          this.outbox = remove(this.outbox, ev.id); this.write();
          this.onDropped?.(ev, res.code ?? "invalid");
          await this.onInvalid?.();
        }
        this.status();
      }
    } finally { this.flushing = false; this.status(); }
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.backoff);
    this.backoff = Math.min(30_000, this.backoff * 2);
  }
  goOnline() { this.backoff = 1000; this.flush(); }
}

function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
