// Stage renderer: sprite, masks, mood classes, and the six action animations (ported from the original app.js).
import { maskForState } from "../game/bites.js";
import { moodFor } from "../game/mood.js";

const PLUSH_SRC = "plush.png";
const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const $all = (sel, root) => [...root.querySelectorAll(sel)];

export function createStage(stage) {
  let state = null;
  let hatEl = null, zzWrap = null, sulkTimer = null, sparkleTimer = null;

  function applyMask(img) {
    const url = state ? maskForState(state) : null;
    img.style.webkitMaskImage = url ?? ""; img.style.maskImage = url ?? "";
    if (url) {
      img.style.webkitMaskRepeat = "no-repeat"; img.style.maskRepeat = "no-repeat";
      img.style.webkitMaskSize = "100% 100%"; img.style.maskSize = "100% 100%";
      img.style.webkitMaskPosition = "center"; img.style.maskPosition = "center";
    }
  }
  function moodClasses(img) {
    if (!state) return;
    const { mood } = moodFor(state);
    img.className = img.className.replace(/\bmood-\w+/g, "").replace(/\s+/g, " ").trim();
    img.classList.add(`mood-${mood}`);
    img.classList.toggle("asleep", !!state.asleep);
    const lvl = state.progress?.level ?? 1;
    img.style.scale = String(1 + 0.025 * (lvl - 1));
    img.classList.toggle("glow", lvl >= 5 && lvl < 10);
    img.classList.toggle("shimmer", lvl >= 10);
  }
  function sprite() { return stage.querySelector(".plush.single"); }
  function spawn({ pop = true } = {}) {
    const img = document.createElement("img");
    img.className = "plush single" + (pop ? " pop" : "");
    img.src = PLUSH_SRC; img.alt = "Plush";
    img.draggable = false;
    stage.appendChild(img);
    applyMask(img); moodClasses(img);
    if (pop) img.addEventListener("animationend", () => img.classList.remove("pop"), { once: true });
    return img;
  }
  function ensure() { return sprite() ?? spawn(); }
  function clearFx() { $all(".burst, .particle, .heart, .loveText, .food, .plush:not(.single)", stage).forEach((el) => el.remove()); }
  function restartClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  /** Idempotent render of the current state (mask, mood, sleep, hat). */
  function render(next, { anniversary = false } = {}) {
    state = next;
    const img = ensure();
    applyMask(img); moodClasses(img);
    // sleep z's
    if (state.asleep && !zzWrap) {
      zzWrap = document.createElement("div"); zzWrap.className = "zzwrap";
      for (let i = 0; i < 3; i++) { const z = document.createElement("span"); z.className = "zz"; z.textContent = "z"; zzWrap.appendChild(z); }
      stage.appendChild(zzWrap);
    } else if (!state.asleep && zzWrap) { zzWrap.remove(); zzWrap = null; }
    // sulky ellipsis loop
    clearInterval(sulkTimer); sulkTimer = null;
    clearInterval(sparkleTimer); sparkleTimer = null;
    const { mood } = moodFor(state);
    if (mood === "sulky" && !reduced()) sulkTimer = setInterval(() => flash("ellipsis", "…"), 6000);
    if (mood === "ecstatic" && !reduced()) sparkleTimer = setInterval(() => sparkleOnce(), 4000);
    if (anniversary && !hatEl) { hatEl = document.createElement("div"); hatEl.className = "hat"; hatEl.textContent = "🎉"; stage.appendChild(hatEl); }
    if (!anniversary && hatEl) { hatEl.remove(); hatEl = null; }
  }
  function flash(cls, text) {
    const el = document.createElement("div"); el.className = cls; el.textContent = text; stage.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
  function sparkleOnce() {
    const el = document.createElement("div"); el.className = "sparkle"; el.textContent = "✨";
    el.style.left = `calc(50% + ${Math.round(Math.random() * 160 - 80)}px)`; el.style.top = `calc(56% + ${Math.round(Math.random() * 120 - 100)}px)`;
    stage.appendChild(el); el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  /* ---- animations ---- */
  function animFeed() {
    const img = ensure();
    const food = document.createElement("div"); food.className = "food"; food.textContent = "🍞"; stage.appendChild(food);
    food.addEventListener("animationend", () => food.remove(), { once: true });
    setTimeout(() => { restartClass(img, "chomp"); setTimeout(() => restartClass(img, "chomp"), 240); }, 380);
  }
  function animCuddle() {
    clearFx();
    const img = ensure();
    restartClass(img, "chomp");
    const t = document.createElement("div"); t.className = "loveText run"; t.textContent = "I LOVE YOU!"; stage.appendChild(t);
    t.addEventListener("animationend", () => t.remove(), { once: true });
    const hearts = ["💗", "💖", "💕", "💞", "💓", "💗", "💖", "💕"];
    const count = reduced() ? 4 : 12;
    for (let i = 0; i < count; i++) {
      const h = document.createElement("div"); h.className = "heart run"; h.textContent = hearts[i % hearts.length];
      h.style.setProperty("--hx", `${Math.random() * 160 - 80}px`); h.style.animationDelay = `${i * 120}ms`;
      stage.appendChild(h); h.addEventListener("animationend", () => h.remove(), { once: true });
    }
    setTimeout(() => img.classList.remove("chomp"), 260);
  }
  function animNibble() { const img = ensure(); restartClass(img, "chomp"); applyMask(img); }
  function animRespawn() {
    const img = ensure();
    img.classList.add("fade-out");
    setTimeout(() => { img.remove(); spawn(); }, 1200);
  }
  function burstAndParticles() {
    const burst = document.createElement("div"); burst.className = "burst run"; stage.appendChild(burst);
    burst.addEventListener("animationend", () => burst.remove(), { once: true });
    const colors = ["#ffe287", "#ff9b24", "#ffd166", "#ffffff"];
    const count = reduced() ? 6 : 22;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div"); p.className = "particle run"; p.style.background = colors[i % colors.length];
      const angle = Math.PI * 2 * (i / count), dist = 240 + Math.random() * 170;
      p.style.setProperty("--dx", `calc(-50% + ${Math.cos(angle) * dist}px)`); p.style.setProperty("--dy", `calc(-50% + ${Math.sin(angle) * dist}px)`);
      stage.appendChild(p); p.addEventListener("animationend", () => p.remove(), { once: true });
    }
  }
  function animBoom() {
    clearFx();
    const img = ensure();
    restartClass(img, "shake");
    setTimeout(() => {
      img.classList.remove("shake"); img.classList.add("explode");
      burstAndParticles();
      img.addEventListener("animationend", () => { img.remove(); setTimeout(() => { if (!sprite()) spawn(); }, 900); }, { once: true });
    }, 260);
  }
  function celebrate() { burstAndParticles(); animCuddle(); }
  function animSleep() { render(state); }
  function animWake() { const img = ensure(); restartClass(img, "chomp"); }

  function animPlay() {
    clearFx();
    const old = sprite(); if (old) old.remove();
    const img = document.createElement("img"); img.className = "plush single"; img.src = PLUSH_SRC; img.alt = "Plush"; img.draggable = false;
    stage.appendChild(img); applyMask(img); moodClasses(img);
    const rect = stage.getBoundingClientRect(); const w = rect.width, h = rect.height;
    let x = w * (0.25 + Math.random() * 0.2), y = h * (0.2 + Math.random() * 0.1);
    let vx = (Math.random() < 0.5 ? 1 : -1) * (420 + Math.random() * 220), vy = -(520 + Math.random() * 260);
    let rot = Math.random() * 40 - 20, vrot = Math.random() * 220 - 110;
    const gravity = 1500, bounce = 0.62, friction = 0.88, floor = h - 26, dtMax = 0.022;
    let last = performance.now(), restingFrames = 0, settled = false;
    const finish = () => {
      setTimeout(() => {
        if (!img.parentNode) return;
        img.classList.add("fade-out");
        setTimeout(() => { if (img.parentNode) img.remove(); if (!sprite()) spawn(); }, 460);
      }, 5000);
    };
    if (reduced()) {
      img.classList.add("reduced-throw");
      img.style.left = `${w * (0.3 + Math.random() * 0.4)}px`; img.style.top = `${floor}px`;
      img.style.transform = `translate(-50%, -50%) rotate(${Math.round(rot)}deg)`;
      finish(); return;
    }
    function step(now) {
      const dt = Math.min(dtMax, (now - last) / 1000); last = now;
      vy += gravity * dt; x += vx * dt; y += vy * dt; rot += vrot * dt;
      if (x < 30) { x = 30; vx = Math.abs(vx) * 0.85; }
      if (x > w - 30) { x = w - 30; vx = -Math.abs(vx) * 0.85; }
      if (y > floor) {
        y = floor; vy = -Math.abs(vy) * bounce; vx *= friction; vrot *= 0.9;
        restingFrames = Math.abs(vy) < 120 && Math.abs(vx) < 70 ? restingFrames + 1 : 0;
      }
      img.style.left = `${x}px`; img.style.top = `${y}px`;
      img.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
      if (restingFrames > 14 && !settled) { settled = true; finish(); return; }
      if (img.parentNode) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const ANIMS = { feed: animFeed, cuddle: animCuddle, play: animPlay, nibble: animNibble, boom: animBoom, sleep: animSleep, wake: animWake };
  const BUSY = { feed: 900, cuddle: 600, play: 1200, nibble: 300, boom: 1500, sleep: 400, wake: 400 };

  /** Play effect tags. Returns the busy duration in ms. */
  function play(effects, nextState) {
    if (nextState) state = nextState;
    let busy = 0;
    for (const tag of effects) {
      const [kind, name] = tag.split(":");
      if (kind === "anim" && ANIMS[name]) { ANIMS[name](); busy = Math.max(busy, BUSY[name] ?? 300); }
      else if (kind === "bites" && name === "respawn") { setTimeout(animRespawn, 300); busy = Math.max(busy, 1600); }
      else if (kind === "celebrate") { setTimeout(celebrate, 200); }
    }
    return busy;
  }
  function chip(name, color) {
    const el = document.createElement("div"); el.className = `chip sw-${color}`; el.textContent = name; stage.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
  function banner(text) {
    let el = stage.querySelector(".banner");
    if (!text) { el?.remove(); return; }
    if (!el) { el = document.createElement("div"); el.className = "banner"; stage.appendChild(el); }
    el.textContent = text;
  }
  function thought(icon) {
    let el = stage.querySelector(".thought");
    if (!icon) { el?.remove(); return; }
    if (!el) { el = document.createElement("div"); el.className = "thought"; stage.appendChild(el); }
    if (el.textContent !== icon) el.textContent = icon;
  }
  return { render, play, chip, banner, thought, spawn, sprite, celebrate };
}
