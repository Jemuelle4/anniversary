import { ACTIONS } from "../game/actions.js";
import { canApply } from "../game/actions.js";

export function createDock(root, { onAction, now = () => Date.now() }) {
  root.classList.add("pet");
  root.innerHTML = ACTIONS.map((a) => `<button class="btn action-btn" type="button" data-action="${a.type}" data-label="${a.label}" aria-label="${a.label}">Click!</button>`).join("");
  let busyUntil = 0, state = null, tick = null;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]"); if (!btn) return;
    revealLabel(btn);
    if (now() < busyUntil) return;
    let type = btn.dataset.action;
    if (type === "sleep" && state?.asleep) type = "wake";
    onAction(type, btn);
  });
  function revealLabel(btn) { if (btn.dataset.revealed === "1") return; btn.dataset.revealed = "1"; btn.textContent = btn.dataset.label; }
  function labelFor(btn) { return btn.dataset.revealed === "1" ? btn.dataset.label : "Click!"; }
  function render(s) {
    state = s; const t = now();
    for (const btn of root.querySelectorAll("[data-action]")) {
      const type = btn.dataset.action;
      if (type === "sleep") { btn.dataset.label = s.asleep ? "Wake" : "Sleep"; btn.setAttribute("aria-label", btn.dataset.label); }
      const check = type === "sleep" && s.asleep ? { ok: true } : canApply(s, type, t);
      btn.setAttribute("aria-disabled", check.ok ? "false" : "true");
      if (type === "boom" && check.reason === "cooldown") {
        const secs = Math.max(1, Math.ceil((s.cooldowns.boom - t) / 1000));
        btn.innerHTML = `${btn.dataset.revealed === "1" ? "Boom" : "Click!"} · <span class="cd">${secs}s</span>`;
      } else btn.textContent = labelFor(btn);
    }
    clearInterval(tick); tick = null;
    if (s.cooldowns.boom > t) tick = setInterval(() => { if (state) render(state); }, 1000);
  }
  function busy(ms) { busyUntil = now() + ms; }
  return { render, busy };
}
