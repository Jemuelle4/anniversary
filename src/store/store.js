/**
 * Store contract (docs/architecture.md §2).
 * @typedef {{ state: object, version: number, partners: Array<{id:string,name:string,color:string}>, me: {partner_id: string|null, user_id?: string}, events: Array<object>, home: {id?: string, invite_code?: string, timezone: string, anniversary_date: string|null} }} Snapshot
 * @typedef {{ id: string, type: string, clientAt: number, expectedVersion: number, newState: object, payload: object }} PendingEvent
 * @typedef {{ ok: boolean, code?: string, state: object, version: number, event?: object }} CommitResult
 * @typedef {{ kind: 'event', event: object } | { kind: 'presence', partnersOnline: string[] } | { kind: 'connection', online: boolean }} StoreMessage
 * @typedef {{ load(): Promise<Snapshot|null>, commit(e: PendingEvent): Promise<CommitResult>, clear(newState: object): Promise<void>, subscribe(cb: (m: StoreMessage) => void): () => void }} Store
 */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });
}
export function eventRowFrom(pending, { partnerId, version, createdAt }) {
  return { id: pending.id, partner_id: partnerId, type: pending.type, version, client_at: new Date(pending.clientAt).toISOString(), created_at: new Date(createdAt).toISOString(), payload: pending.payload ?? {}, state_after: pending.newState };
}
