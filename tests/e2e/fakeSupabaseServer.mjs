// A fake Supabase for browser end-to-end tests: HTTP RPCs over the SQLite harness + long-poll events.
// Usage: node tests/e2e/fakeSupabaseServer.mjs [port]
import { createServer } from "node:http";
import * as db from "../db/localDb.js";

const port = Number(process.argv[2] ?? 8766);
const d = db.openDb();
const RPC = {
  server_now: () => new Date().toISOString(),
  home_snapshot: ({ userId }) => db.homeSnapshot(d, { userId }),
  create_home: ({ userId, p }) => db.createHome(d, { userId, name: p.p_name, color: p.p_color, initialState: p.p_initial_state, timezone: p.p_timezone, broughtLocal: p.p_brought_local }),
  join_home: ({ userId, p }) => db.joinHome(d, { userId, code: p.p_code, name: p.p_name, color: p.p_color }),
  commit_action: ({ userId, p }) => db.commitAction(d, { userId, eventId: p.p_event_id, type: p.p_type, clientAt: Date.parse(p.p_client_at), expectedVersion: Number(p.p_expected_version), newState: p.p_new_state, payload: p.p_payload }),
  reset_home: ({ userId, p }) => db.resetHome(d, { userId, newState: p.p_new_state }),
  leave_home: ({ userId }) => db.leaveHome(d, { userId }),
  update_home: ({ userId, p }) => db.updateHome(d, { userId, timezone: p.p_timezone, anniversaryDate: p.p_anniversary_date }),
  update_partner: ({ userId, p }) => db.updatePartner(d, { userId, name: p.p_name, color: p.p_color }),
  add_memory: ({ userId, p }) => { const home = db.myHomeId(d, userId); memories.push({ id: `m${memories.length}`, home_id: home, partner_id: p.p_kind === "moment" ? db.homeSnapshot(d, { userId }).me.partner_id : null, kind: p.p_kind, key: p.p_key, caption: p.p_caption, photo_path: p.p_photo_path, happened_at: p.p_happened_at ?? new Date().toISOString() }); return memories.at(-1); },
  list_memories: ({ userId }) => memories.filter((m) => m.home_id === db.myHomeId(d, userId)).reverse(),
  delete_memory: ({ userId, p }) => { const i = memories.findIndex((m) => m.id === p.p_id); if (i >= 0) memories.splice(i, 1); },
};
const memories = [];
function json(res, code, body) { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*" }); res.end(JSON.stringify(body ?? null)); }
createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, null);
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/events") {
    const home = url.searchParams.get("home"), after = Number(url.searchParams.get("after") ?? 0);
    const rows = d.prepare("SELECT * FROM plush_events WHERE home_id = ? AND version > ? ORDER BY version").all(home, after).map((r) => ({ ...r, version: Number(r.version), payload: JSON.parse(r.payload), state_after: JSON.parse(r.state_after) }));
    return json(res, 200, rows);
  }
  let body = ""; for await (const c of req) body += c;
  const { userId, params } = JSON.parse(body || "{}");
  const name = url.pathname.replace("/rpc/", "");
  if (!RPC[name]) return json(res, 404, { error: "no such rpc" });
  try { json(res, 200, { data: RPC[name]({ userId, p: params ?? {} }) ?? null }); }
  catch (e) { json(res, 200, { error: { message: e.code ?? e.message, code: e.code } }); }
}).listen(port, () => console.log("fake supabase on", port));
