// Static check: every RPC the client calls exists in the migrations with the same p_ parameter names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const sql = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8")).join("\n");
const store = readFileSync(new URL("../src/store/supabaseStore.js", import.meta.url), "utf8");

function sqlParams(name) {
  const m = sql.match(new RegExp(`create or replace function ${name}\\(([^)]*)\\)`, "i"));
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
}
test("every client rpc() call matches a SQL function and its parameter names", () => {
  const calls = [...store.matchAll(/this\.rpc\("(\w+)"(?:,\s*\{([^}]*)\})?/g)];
  assert.ok(calls.length >= 10);
  for (const [, name, args] of calls) {
    const params = sqlParams(name);
    assert.ok(params, `SQL function ${name} missing`);
    const used = args ? [...args.matchAll(/(p_\w+)\s*:/g)].map((m) => m[1]) : [];
    for (const u of used) assert.ok(params.includes(u), `${name}: client passes ${u}, SQL has ${params.join(", ")}`);
  }
});
test("SQL grants cover the RPCs and the internal advance function is not callable", () => {
  for (const fn of ["server_now", "create_home", "join_home", "commit_action", "reset_home", "leave_home", "home_snapshot", "update_home", "update_partner", "add_memory", "list_memories", "delete_memory"]) assert.match(sql, new RegExp(`grant execute on function[^;]*\\b${fn}\\(`), fn);
  assert.match(sql, /revoke execute on function plush_advance/);
});
