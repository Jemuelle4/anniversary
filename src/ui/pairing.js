import { PARTNER_COLORS } from "../game/constants.js";
import { openSheet, el } from "./sheet.js";

export function colorPicker(initial = "rose") {
  let value = initial;
  const wrap = el("div", { class: "swatches", role: "radiogroup", "aria-label": "Colour" });
  const btns = PARTNER_COLORS.map((c) => el("button", { type: "button", class: `swatch sw-${c}`, role: "radio", "aria-checked": String(c === value), "aria-label": c, onclick: () => { value = c; btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === c))); } }));
  btns.forEach((b, i) => { b.dataset.c = PARTNER_COLORS[i]; wrap.appendChild(b); });
  return { el: wrap, get value() { return value; } };
}
export function formatCode(raw) {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PLUSH/, "");
  return s ? `PLUSH-${s.slice(0, 4)}` : "";
}
export function isValidCode(code) { return /^PLUSH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(code); }

const ERRORS = { not_found: "That code doesn't match a home.", home_full: "This home already has two people. If that's you, use the same name you used before.", already_member: "This device already belongs to a home. Reload." };

/** Pairing flow. Resolves with the RPC result once paired. */
export function openPairing({ store, hasLocalState, takeLocalState, joinCode = "", welcomeBack = false, initialState, timezone }) {
  return new Promise((resolve) => {
    let sheet;
    const show = (content, title) => { sheet?.close(); sheet = openSheet({ title, content, onClose: () => {} }); };
    const choose = () => show(el("div", {}, [
      el("p", { class: "hint", text: welcomeBack ? "Welcome back? Enter your code and the same name you used before." : "Plush is looked after by two people. Start a new one or join with a code." }),
      el("div", { class: "actions" }, [
        el("button", { class: "btn primary", type: "button", text: "Start a new Plush", onclick: start }),
        el("button", { class: "btn ghost", type: "button", text: "I have a code", onclick: () => join(joinCode) }),
      ]),
    ]), "Set up your Plush home");

    const start = () => {
      const name = el("input", { type: "text", maxlength: "16", placeholder: "Your name", autofocus: "" });
      const colors = colorPicker("rose");
      const bring = el("button", { class: "switch", type: "button", role: "switch", "aria-checked": "true", onclick: (e) => e.currentTarget.setAttribute("aria-checked", e.currentTarget.getAttribute("aria-checked") === "true" ? "false" : "true") });
      const err = el("div", { class: "error" });
      const go = el("button", { class: "btn primary", type: "button", text: "Create", onclick: async () => {
        const n = name.value.trim(); if (!n) { err.textContent = "Add your name."; return; }
        go.disabled = true;
        try {
          const brought = hasLocalState && bring.getAttribute("aria-checked") === "true";
          const state = brought ? takeLocalState() : initialState();
          const r = await store.createHome({ name: n, color: colors.value, initialState: state, timezone, broughtLocal: brought });
          showCode(r);
        } catch (e) { err.textContent = ERRORS[e.code] ?? e.message ?? "Something went wrong."; go.disabled = false; }
      } });
      show(el("div", {}, [
        el("label", { text: "Your name" }), name, el("label", { text: "Your colour" }), colors.el,
        hasLocalState ? el("div", { class: "toggle" }, [el("span", { text: "Bring my current Plush" }), bring]) : null,
        err, el("div", { class: "actions" }, [go, el("button", { class: "btn ghost", type: "button", text: "Back", onclick: choose })]),
      ]), "Start a new Plush");
    };

    const showCode = (r) => {
      const url = `${location.origin}${location.pathname}?join=${r.invite_code}`;
      const copy = el("button", { class: "btn ghost", type: "button", text: "Copy", onclick: async () => { try { await navigator.clipboard.writeText(r.invite_code); copy.textContent = "Copied"; } catch {} } });
      const share = navigator.share ? el("button", { class: "btn primary", type: "button", text: "Share", onclick: () => navigator.share({ text: `Come look after Plush with me: ${url}` }).catch(() => {}) }) : null;
      show(el("div", {}, [
        el("p", { class: "hint", text: "Send this code to your partner. It's the only way in." }),
        el("div", { class: "code", text: r.invite_code }),
        el("div", { class: "actions" }, [share, copy]),
        el("div", { class: "actions" }, [el("button", { class: "btn primary", type: "button", text: "Continue", onclick: () => { sheet.close(); resolve(r); } })]),
      ]), "Your invite code");
    };

    const join = (prefill) => {
      const code = el("input", { type: "text", placeholder: "PLUSH-XXXX", autocapitalize: "characters", autocomplete: "off", autofocus: "" });
      code.value = formatCode(prefill);
      code.addEventListener("input", () => { const pos = code.value.length; code.value = formatCode(code.value); code.setSelectionRange(pos + 1, pos + 1); });
      const name = el("input", { type: "text", maxlength: "16", placeholder: "Your name" });
      const colors = colorPicker("sky");
      const err = el("div", { class: "error" });
      const go = el("button", { class: "btn primary", type: "button", text: "Join", onclick: async () => {
        const c = formatCode(code.value), n = name.value.trim();
        if (!isValidCode(c)) { err.textContent = "Codes look like PLUSH-4K7Q."; return; }
        if (!n) { err.textContent = "Add your name."; return; }
        go.disabled = true;
        try { const r = await store.joinHome({ code: c, name: n, color: colors.value }); sheet.close(); resolve(r); }
        catch (e) { err.textContent = ERRORS[e.code] ?? ERRORS[e.message] ?? e.message ?? "Something went wrong."; go.disabled = false; }
      } });
      show(el("div", {}, [
        el("label", { text: "Invite code" }), code, el("label", { text: "Your name" }), name, el("label", { text: "Your colour" }), colors.el, err,
        el("div", { class: "actions" }, [go, el("button", { class: "btn ghost", type: "button", text: "Back", onclick: choose })]),
      ]), "Join with a code");
    };

    if (joinCode) join(joinCode); else choose();
  });
}
