import config from "../config.js";
import { LocalStore } from "./store/localStore.js";
import { SupabaseStore } from "./store/supabaseStore.js";
import { getClient } from "./sync/client.js";
import { openAddMoment } from "./ui/moments.js";
import { createToast } from "./ui/toast.js";
import { escapeHtml, el } from "./ui/sheet.js";
import { chooseMode, readCache } from "./pet.js";

const KIND_ICON = { moment: "📷", level: "⬆️", streak: "🔥", eaten: "😬", anniversary: "🎉", joined: "🏠" };

export async function bootMemories(root) {
  const grid = root.querySelector("#memGrid");
  const toast = createToast(root.querySelector("#toast"));
  const mode = chooseMode();
  let store, partners = [];
  if (mode === "local") { store = new LocalStore(); const snap = await store.load(); partners = snap?.partners ?? []; }
  else {
    try { store = new SupabaseStore(await getClient(config)); const snap = await store.load(); if (!snap) { location.href = "surprise.html"; return; } partners = snap.partners; }
    catch (e) { grid.innerHTML = `<div class="empty">Couldn't load memories: ${escapeHtml(e.message)}</div>`; return; }
  }
  let before = null, done = false, loading = false;
  async function loadMore() {
    if (done || loading) return; loading = true;
    const rows = await store.listMemories({ before, limit: 20 });
    if (!rows.length && !before) grid.innerHTML = `<div class="empty">No memories yet. Add a moment, or keep looking after Plush and milestones will show up here.</div>`;
    for (const row of rows) grid.appendChild(await card(row));
    if (rows.length < 20) done = true; else before = rows[rows.length - 1].happened_at;
    loading = false;
  }
  async function card(row) {
    const p = partners.find((x) => x.id === row.partner_id);
    const who = p ? (p.id === "local" ? "You" : p.name) : "Plush";
    const c = el("div", { class: "mem-card" });
    if (row.photo_path) { const url = await store.signedUrl(row.photo_path); if (url) c.appendChild(el("img", { src: url, alt: row.caption ?? "Photo", loading: "lazy" })); }
    const date = new Date(row.happened_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const del = el("button", { class: "icon-btn", type: "button", "aria-label": "Delete memory", text: "…", style: "width:32px;height:32px;font-size:14px;margin-left:auto" });
    del.addEventListener("click", async () => {
      if (!confirm("Delete this memory?")) return;
      try { await store.deleteMemory(row.id, row.photo_path); c.remove(); toast.show("Deleted."); } catch (e) { toast.show("Couldn't delete: " + e.message); }
    });
    const body = el("div", { class: "body" }, [
      row.caption ? el("p", { class: "cap", text: row.caption }) : null,
      el("div", { class: "meta" }, [el("span", { text: KIND_ICON[row.kind] ?? "•" }), p ? el("span", { class: `sw sw-${p.color}` }) : null, el("span", { text: who }), el("span", { text: "·" }), el("span", { text: date }), del]),
    ]);
    c.appendChild(body);
    return c;
  }
  root.querySelector("#addMoment").addEventListener("click", () => openAddMoment({ store, toast: (t) => toast.show(t), onSaved: async (row) => { grid.querySelector(".empty")?.remove(); grid.prepend(await card(row)); } }));
  window.addEventListener("scroll", () => { if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) loadMore(); });
  await loadMore();
  if (mode === "supabase" && !readCache()) return;
}
