/* One JS file for all pages */
const PLUSH_SRC = "plush.png";
const STAGE_ID = "stage";

function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }
function navTo(path){ window.location.href = path; }

function revealLabelIfNeeded(btn){
  if(!btn) return;
  if(btn.dataset.revealed === "1") return;
  btn.textContent = btn.dataset.label || btn.textContent;
  btn.dataset.revealed = "1";
}

/* ---------------- Bite state (spiral inward) ---------------- */
let biteState = null;
let biteBites = [];

function initBiteState(){
  const maxBites = 20;
  const startAngle = Math.random() * Math.PI * 2;
  const startR = 47;
  const endR = 6;
  const turns = 2.2;
  const points = [];

  for(let i=0;i<maxBites;i++){
    const t = i / (maxBites - 1);
    const r = startR + (endR - startR) * t;
    const theta = startAngle + (turns * Math.PI * 2) * t;

    let x = 50 + r * Math.cos(theta);
    let y = 50 + r * Math.sin(theta);

    x += (Math.random()*2 - 1) * 1.2;
    y += (Math.random()*2 - 1) * 1.2;

    x = Math.max(5, Math.min(95, x));
    y = Math.max(5, Math.min(95, y));

    const br = 8 + Math.random()*5;
    points.push({x, y, r: br});
  }

  biteState = { idx: 0, points, gone: false };
}

function svgMaskDataUrl(bites){
  const circles = bites.map(b => `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="black" />`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <mask id="m">
    <rect x="0" y="0" width="100" height="100" fill="white"/>
    ${circles}
  </mask>
  <rect x="0" y="0" width="100" height="100" fill="white" mask="url(#m)"/>
</svg>`;
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `url("data:image/svg+xml;base64,${b64}")`;
}

function applyBiteMask(plush, bites){
  const url = svgMaskDataUrl(bites);
  plush.style.webkitMaskImage = url;
  plush.style.maskImage = url;
  plush.style.webkitMaskRepeat = "no-repeat";
  plush.style.maskRepeat = "no-repeat";
  plush.style.webkitMaskSize = "100% 100%";
  plush.style.maskSize = "100% 100%";
  plush.style.webkitMaskPosition = "center";
  plush.style.maskPosition = "center";
}

/* Helpers */
function spawnPlush(stage, opts={}){
  const img = document.createElement("img");
  img.className = "plush pop";
  if(opts.single) img.classList.add("single");
  img.src = PLUSH_SRC;
  img.alt = "Plush";
  stage.appendChild(img);
  return img;
}

/* Explode */
function runExplode(stage){
  $all(".burst, .particle, .heart, .loveText, .plush.single", stage).forEach(el => el.remove());

  const plush = spawnPlush(stage, {single:true});
  plush.addEventListener("animationend", () => {
    plush.classList.remove("pop");
    plush.classList.add("shake");
    setTimeout(() => {
      plush.classList.remove("shake");
      plush.classList.add("explode");

      const burst = document.createElement("div");
      burst.className = "burst run";
      stage.appendChild(burst);

      const colors = ["#ffe287","#ff9b24","#ffd166","#ffffff"];
      const count = 22;
      for(let i=0;i<count;i++){
        const p = document.createElement("div");
        p.className = "particle run";
        p.style.background = colors[i % colors.length];

        const angle = (Math.PI * 2) * (i / count);
        const dist = 240 + Math.random()*170;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        p.style.setProperty("--dx", `calc(-50% + ${dx}px)`);
        p.style.setProperty("--dy", `calc(-50% + ${dy}px)`);
        stage.appendChild(p);

        p.addEventListener("animationend", () => p.remove(), {once:true});
      }

      burst.addEventListener("animationend", () => burst.remove(), {once:true});
      plush.addEventListener("animationend", () => plush.remove(), {once:true});
    }, 220);
  }, {once:true});
}

/* Bite (1 per click, spiral inward, random start each reset) */
function runBite(stage){
  $all(".burst, .particle, .heart, .loveText", stage).forEach(el => el.remove());

  if(!biteState) initBiteState();

  let plush = stage.querySelector(".plush.single");

  if(biteState.gone){
    biteState = null;
    biteBites = [];
    if(plush) plush.remove();
    plush = null;
    initBiteState();
  }

  if(!plush){
    plush = spawnPlush(stage, {single:true});
    plush.addEventListener("animationend", () => plush.classList.remove("pop"), {once:true});
  } else {
    plush.classList.remove("chomp");
    void plush.offsetWidth;
    plush.classList.add("chomp");
  }

  const pt = biteState.points[biteState.idx];
  if(pt){
    biteBites.push(pt);
    biteState.idx += 1;
  }
  applyBiteMask(plush, biteBites);

  if(biteState.idx >= biteState.points.length){
    biteState.gone = true;
    plush.classList.remove("chomp");
    plush.classList.add("fade-out");
    setTimeout(() => {
      if(plush && plush.parentNode) plush.remove();
    }, 460);
  }
}

/* Love (slower/longer hearts, higher text) */
function runLove(stage){
  $all(".burst, .particle, .heart, .loveText, .plush.single", stage).forEach(el => el.remove());

  const plush = spawnPlush(stage, {single:true});
  plush.addEventListener("animationend", () => {
    plush.classList.remove("pop");
    plush.classList.add("chomp");

    const t = document.createElement("div");
    t.className = "loveText run";
    t.textContent = "I LOVE YOU!";
    stage.appendChild(t);
    t.addEventListener("animationend", () => t.remove(), {once:true});

    const hearts = ["💗","💖","💕","💞","💓","💗","💖","💕"];
    const count = 12;
    for(let i=0;i<count;i++){
      const h = document.createElement("div");
      h.className = "heart run";
      h.textContent = hearts[i % hearts.length];
      const hx = (Math.random()*160 - 80);
      h.style.setProperty("--hx", `${hx}px`);
      h.style.animationDelay = `${i*120}ms`;
      stage.appendChild(h);
      h.addEventListener("animationend", () => h.remove(), {once:true});
    }

    setTimeout(() => plush.classList.remove("chomp"), 260);
  }, {once:true});
}

/* Throw (final pose = last physics frame; disappear 5s after settle) */
function runThrow(stage){
  $all(".burst, .particle, .heart, .loveText, .plush.single", stage).forEach(el => el.remove());

  const img = document.createElement("img");
  img.className = "plush";
  img.src = PLUSH_SRC;
  img.alt = "Plush";
  stage.appendChild(img);

  const rect = stage.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  let x = w * (0.25 + Math.random()*0.2);
  let y = h * (0.2 + Math.random()*0.1);
  let vx = (Math.random() < 0.5 ? 1 : -1) * (420 + Math.random()*220);
  let vy = -(520 + Math.random()*260);
  let rot = (Math.random()*40 - 20);
  let vrot = (Math.random()*220 - 110);

  const gravity = 1500;
  const bounce = 0.62;
  const friction = 0.88;
  const floor = h - 26;
  const dtMax = 0.022;

  let last = performance.now();
  let restingFrames = 0;
  let settled = false;
  let cleanupTimer = null;

  function scheduleCleanup(){
    if(cleanupTimer) return;
    cleanupTimer = setTimeout(() => {
      if(!img || !img.parentNode) return;
      img.classList.add("fade-out");
      setTimeout(() => {
        if(img && img.parentNode) img.remove();
      }, 460);
    }, 5000);
  }

  function step(now){
    const dt = Math.min(dtMax, (now - last) / 1000);
    last = now;

    vy += gravity * dt;
    x += vx * dt;
    y += vy * dt;
    rot += vrot * dt;

    if(x < 30){ x = 30; vx = Math.abs(vx) * 0.85; }
    if(x > w - 30){ x = w - 30; vx = -Math.abs(vx) * 0.85; }

    if(y > floor){
      y = floor;
      vy = -Math.abs(vy) * bounce;
      vx *= friction;
      vrot *= 0.9;

      if(Math.abs(vy) < 120 && Math.abs(vx) < 70){
        restingFrames += 1;
      } else {
        restingFrames = 0;
      }
    }

    img.style.left = `${x}px`;
    img.style.top = `${y}px`;
    img.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

    if(restingFrames > 14 && !settled){
      settled = true;
      scheduleCleanup();
      return;
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* Wiring */
function wireNav(){
  $all("[data-nav]").forEach(btn => btn.addEventListener("click", () => navTo(btn.getAttribute("data-nav"))));
  const surpriseBtn = document.getElementById("surpriseBtn");
  if(surpriseBtn) surpriseBtn.addEventListener("click", () => navTo("surprise.html"));
}

function wireActions(){
  const stage = document.getElementById(STAGE_ID);
  if(!stage) return;

  const actionMap = {
    explode: () => runExplode(stage),
    bite: () => runBite(stage),
    throw: () => runThrow(stage),
    love: () => runLove(stage),
  };

  $all("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      revealLabelIfNeeded(btn);
      const action = btn.getAttribute("data-action");
      const fn = actionMap[action];
      if(fn) fn();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => { wireNav(); wireActions(); });
