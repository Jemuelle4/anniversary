// Browser-side fake of the supabase-js surface Plush uses. Talks to fakeSupabaseServer.mjs.
export function createFakeClient({ base, userId }) {
  const listeners = new Set();
  async function call(name, params) {
    const r = await fetch(`${base}/rpc/${name}`, { method: "POST", body: JSON.stringify({ userId, params }) });
    return r.json();
  }
  return {
    auth: { async getSession() { return { data: { session: { user: { id: userId } } } }; }, async signInAnonymously() { return { data: { session: { user: { id: userId } } } }; } },
    rpc: (name, params) => call(name, params),
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
    storage: { from: () => ({ upload: async () => ({}), remove: async () => ({}), createSignedUrl: async () => ({ data: { signedUrl: "" } }) }) },
    channel(name) {
      const homeId = name.replace("home:", "");
      const handlers = { insert: [], presence: [] };
      let last = 0, timer = null, status = null;
      const ch = {
        on(kind, opts, cb) { if (kind === "postgres_changes") handlers.insert.push(cb); else if (kind === "presence") handlers.presence.push(cb); return ch; },
        subscribe(cb) {
          status = cb; cb("SUBSCRIBED");
          fetch(`${base}/events?home=${homeId}&after=0`).then((r) => r.json()).then((rows) => { last = rows.at(-1)?.version ?? 0; });
          timer = setInterval(async () => {
            try {
              const rows = await fetch(`${base}/events?home=${homeId}&after=${last}`).then((r) => r.json());
              for (const row of rows) { last = row.version; handlers.insert.forEach((h) => h({ new: row })); }
            } catch { /* offline: the app's own pill and outbox handle it */ }
          }, 400);
          return ch;
        },
        presenceState() { return {}; },
        track() {},
        _stop() { clearInterval(timer); },
      };
      listeners.add(ch);
      return ch;
    },
    removeChannel(ch) { ch._stop(); listeners.delete(ch); },
  };
}
