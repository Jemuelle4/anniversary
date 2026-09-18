import { NEEDS, NEED_ICONS, NEED_LABELS } from "../game/constants.js";
import { moodFor } from "../game/mood.js";
import { levelProgress, levelTitle } from "../game/progress.js";
import { relativeTime } from "../game/time.js";
import { RITUAL_LABELS, VERBS } from "../game/copy.js";

export function createHud(root) {
  root.innerHTML = `
    <div class="meters">${NEEDS.map((n) => `<div class="meter" data-need="${n}" role="meter" aria-label="${NEED_LABELS[n]}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span aria-hidden="true">${NEED_ICONS[n]}</span><div class="bar"><div class="fill" style="width:0%"></div></div></div>`).join("")}</div>
    <div class="moodline"><span class="mood"></span> <span class="dim last"></span></div>
    <div class="levelline"><span class="lvl"></span><div class="levelbar"><div class="fill"></div></div><span class="streak"></span></div>
    <div class="rituals">${["breakfast", "playtime", "goodnight"].map((r) => `<span data-ritual="${r}"><span class="tick" aria-hidden="true">☐</span> ${RITUAL_LABELS[r]}</span>`).join("")}</div>`;
  let expandTimer = null;
  root.addEventListener("click", () => { root.classList.add("expanded"); clearTimeout(expandTimer); expandTimer = setTimeout(() => root.classList.remove("expanded"), 4000); });
  const prevRituals = {};

  function render(state, snapshot, now) {
    for (const n of NEEDS) {
      const el = root.querySelector(`[data-need="${n}"]`);
      const v = Math.round(state.needs[n]);
      el.querySelector(".fill").style.width = `${v}%`;
      el.setAttribute("aria-valuenow", String(v));
      el.classList.toggle("low", v < 30); el.classList.toggle("mid", v >= 30 && v < 60);
    }
    const m = moodFor(state);
    root.querySelector(".mood").textContent = m.word;
    const last = state.lastAction;
    let lastText = "· new";
    if (last) {
      const who = snapshot?.partners?.find((p) => p.id === last.by);
      const name = who ? (who.id === "local" ? "You" : who.name) : (last.by ? "someone" : null);
      const verb = VERBS[last.type] ?? last.type;
      lastText = name ? `· ${name} ${verb} ${relativeTime(last.at, now)}` : `· last cared for ${relativeTime(last.at, now)}`;
    }
    root.querySelector(".last").textContent = lastText;
    const p = state.progress;
    root.querySelector(".lvl").textContent = `Lv ${p.level} · ${levelTitle(p.level)}`;
    root.querySelector(".levelbar .fill").style.width = `${Math.round(levelProgress(p.carePoints) * 100)}%`;
    root.querySelector(".streak").textContent = p.streak.count >= 2 ? `🔥 ${p.streak.count}` : "";
    for (const r of ["breakfast", "playtime", "goodnight"]) {
      const el = root.querySelector(`[data-ritual="${r}"]`); const done = !!p.rituals[r];
      el.classList.toggle("done", done);
      const tick = el.querySelector(".tick"); tick.textContent = done ? "☑" : "☐";
      if (done && !prevRituals[r]) { tick.classList.remove("pop"); void tick.offsetWidth; tick.classList.add("pop"); }
      prevRituals[r] = done;
    }
  }
  return { render };
}
