/* One entry module for all pages. The page is chosen by <body data-page>. */
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function navTo(path) { window.location.href = path; }

function wireNav() {
  $all("[data-nav]").forEach((btn) => btn.addEventListener("click", () => navTo(btn.getAttribute("data-nav"))));
  const surpriseBtn = document.getElementById("surpriseBtn");
  if (surpriseBtn) surpriseBtn.addEventListener("click", () => navTo("surprise.html"));
}

function registerSw() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          const t = document.getElementById("toast");
          if (t) { t.textContent = "Plush has an update · tap to reload"; t.classList.add("show"); t.style.pointerEvents = "auto"; t.onclick = () => location.reload(); }
        }
      });
    });
  }).catch(() => {});
}

/** Landing: keep the gift as-is, but let the year number follow the home's anniversary date when known. */
function landingYears() {
  try {
    const cache = JSON.parse(localStorage.getItem("plush.v2.cache"));
    const d = cache?.home?.anniversary_date; if (!d) return;
    const years = new Date().getFullYear() - Number(d.slice(0, 4));
    const h1 = document.querySelector(".hero h1");
    if (h1 && years > 0) h1.innerHTML = `Happy ${years} Year<br/>Anniversary!`;
  } catch {}
}

document.addEventListener("DOMContentLoaded", async () => {
  wireNav();
  registerSw();
  const page = document.body.dataset.page;
  if (page === "home") landingYears();
  if (page === "pet") { const { PetController } = await import("./src/pet.js"); window.plush = new PetController(document.body); await window.plush.boot(); }
  if (page === "playground") { const { bootPlayground } = await import("./src/playground.js"); bootPlayground(document.body); }
  if (page === "memories") { const { bootMemories } = await import("./src/memories.js"); await bootMemories(document.body); }
});
