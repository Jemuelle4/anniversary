// Bottom sheet with backdrop, Esc, and a focus trap.
export function openSheet({ title, content, onClose } = {}) {
  const backdrop = document.createElement("div"); backdrop.className = "sheet-backdrop";
  const sheet = document.createElement("div"); sheet.className = "sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  if (title) sheet.setAttribute("aria-label", title);
  sheet.innerHTML = `<div class="handle"></div>${title ? `<h2>${escapeHtml(title)}</h2>` : ""}`;
  if (typeof content === "string") sheet.insertAdjacentHTML("beforeend", content); else if (content) sheet.appendChild(content);
  backdrop.appendChild(sheet); document.body.appendChild(backdrop);
  const previous = document.activeElement;
  const focusables = () => [...sheet.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.disabled);
  function close() {
    if (!backdrop.parentNode) return;
    backdrop.remove(); document.removeEventListener("keydown", onKey); onClose?.(); previous?.focus?.();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") {
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);
  setTimeout(() => (sheet.querySelector("[autofocus]") ?? focusables()[0])?.focus(), 30);
  return { close, el: sheet };
}
export function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
  for (const c of [].concat(children)) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}
