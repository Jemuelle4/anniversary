import { openSheet, el } from "./sheet.js";
import { openFeed } from "./feed.js";
import { openSettings } from "./settings.js";
import { openAddMoment } from "./moments.js";
import { diffDays, dayKey } from "../game/time.js";

export function openMenu({ ctl }) {
  const items = [];
  const item = (text, fn, cls = "") => el("button", { class: `item ${cls}`, type: "button", text, onclick: () => { sheet.close(); fn(); } });
  items.push(item("Activity", () => openFeed({ events: ctl.snapshot.events, partners: ctl.snapshot.partners, now: ctl.now() })));
  items.push(item("Memories", () => (location.href = "memories.html")));
  items.push(item("Add a moment", () => openAddMoment({ store: ctl.store, toast: (t) => ctl.toast.show(t) })));
  items.push(item("Settings", () => openSettings({ ctl })));
  if (ctl.snapshot.home.invite_code) items.push(item("Invite code", () => ctl.showInvite()));
  items.push(item("Playground", () => (location.href = "actions.html")));
  items.push(item("Reset Plush", () => { if (confirm("Start over with a brand new Plush?")) ctl.reset(); }, "danger"));
  const countdown = anniversaryCountdown(ctl);
  const sheet = openSheet({ title: "Plush", content: el("div", {}, [countdown ? el("div", { class: "hint", text: countdown }) : null, ...items]) });
}

export function anniversaryCountdown(ctl) {
  const d = ctl.snapshot.home.anniversary_date; if (!d) return null;
  const today = dayKey(ctl.now(), ctl.snapshot.home.timezone);
  const [y, m, day] = d.split("-");
  let next = `${today.slice(0, 4)}-${m}-${day}`;
  if (diffDays(today, next) < 0) next = `${Number(today.slice(0, 4)) + 1}-${m}-${day}`;
  const n = diffDays(today, next);
  if (n === 0) return "Happy anniversary!";
  return `${n} day${n === 1 ? "" : "s"} to your anniversary`;
}
