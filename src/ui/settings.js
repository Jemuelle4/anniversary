import { openSheet, el } from "./sheet.js";
import { colorPicker } from "./pairing.js";
import { safeTz } from "../game/time.js";

export function openSettings({ ctl }) {
  const me = ctl.me();
  const name = el("input", { type: "text", maxlength: "16", value: me?.name ?? "" });
  const colors = colorPicker(me?.color ?? "beige");
  const tz = el("input", { type: "text", value: ctl.snapshot.home.timezone ?? "UTC", placeholder: "Area/City" });
  const ann = el("input", { type: "date", value: ctl.snapshot.home.anniversary_date ?? "" });
  const err = el("div", { class: "error" });
  const status = el("div", { class: "hint" });
  const save = el("button", { class: "btn primary", type: "button", text: "Save", onclick: async () => {
    err.textContent = ""; save.disabled = true;
    try {
      const n = name.value.trim(); if (!n) throw new Error("Add your name.");
      await ctl.updatePartner({ name: n, color: colors.value });
      await ctl.updateHome({ timezone: safeTz(tz.value.trim() || "UTC"), anniversary_date: ann.value || null });
      ctl.toast.show("Saved"); sheet.close();
    } catch (e) { err.textContent = e.message ?? "Couldn't save."; save.disabled = false; }
  } });
  const parts = [el("label", { text: "My name" }), name, el("label", { text: "My colour" }), colors.el, el("label", { text: "Home timezone" }), tz, el("label", { text: "Anniversary date" }), ann];
  if (ctl.pushSupported()) {
    const sw = el("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(ctl.pushEnabled()), onclick: async () => {
      const on = sw.getAttribute("aria-checked") !== "true";
      sw.disabled = true;
      try { await ctl.setPush(on); sw.setAttribute("aria-checked", String(on)); status.textContent = on ? "Plush will nudge you when it needs something (not between 22:00 and 08:00)." : ""; }
      catch (e) { status.textContent = e.message ?? "Couldn't change reminders."; }
      sw.disabled = false;
    } });
    parts.push(el("div", { class: "toggle" }, [el("span", { text: "Remind me" }), sw]));
    if (ctl.isIosNotInstalled()) parts.push(el("div", { class: "hint", text: "On iPhone, add Plush to your Home Screen first (Share → Add to Home Screen) to get reminders." }));
    parts.push(status);
  }
  if (ctl.snapshot.home.invite_code) parts.push(el("label", { text: "Invite code" }), el("div", { class: "code", text: ctl.snapshot.home.invite_code }));
  parts.push(err, el("div", { class: "actions" }, [save, el("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => sheet.close() })]));
  if (ctl.mode === "supabase") parts.push(el("button", { class: "item danger", type: "button", text: "Leave this home", onclick: async () => { if (confirm("Leave this home on this device? Plush stays with your partner.")) { await ctl.leaveHome(); } } }));
  const sheet = openSheet({ title: "Settings", content: el("div", {}, parts) });
}
