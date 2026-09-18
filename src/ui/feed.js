import { openSheet, el, escapeHtml } from "./sheet.js";
import { verbFor } from "../game/copy.js";
import { relativeTime } from "../game/time.js";

export function feedLine(row, partners, now) {
  const p = partners.find((x) => x.id === row.partner_id);
  const name = p ? (p.id === "local" ? "You" : p.name) : "Someone";
  const color = p?.color ?? "beige";
  const at = Date.parse(row.created_at ?? row.client_at);
  return { name, color, verb: verbFor(row), when: relativeTime(at, now) };
}
export function openFeed({ events, partners, now }) {
  const list = el("div", { class: "list" });
  if (!events.length) list.appendChild(el("div", { class: "hint", text: "Nothing yet. Go look after Plush." }));
  for (const row of events) {
    const l = feedLine(row, partners, now);
    list.insertAdjacentHTML("beforeend", `<div class="event"><span class="sw sw-${l.color}"></span><span><b>${escapeHtml(l.name)}</b> ${escapeHtml(l.verb)}</span><span class="when">${l.when}</span></div>`);
  }
  return openSheet({ title: "Activity", content: list });
}
