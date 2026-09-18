import { openSheet, el } from "./sheet.js";
import { resizeImage } from "./photo.js";
import { uuid } from "../store/store.js";

/** "Add a moment" sheet. onSaved(row) is called after the memory is stored. */
export function openAddMoment({ store, onSaved, toast }) {
  const caption = el("textarea", { maxlength: "140", rows: "3", placeholder: "What happened?" });
  const counter = el("div", { class: "hint", text: "0/140" });
  caption.addEventListener("input", () => (counter.textContent = `${caption.value.length}/140`));
  const file = el("input", { type: "file", accept: "image/*" });
  const preview = el("img", { alt: "", style: "display:none;width:100%;border-radius:14px;margin-top:10px;max-height:220px;object-fit:cover" });
  const err = el("div", { class: "error" });
  let blob = null;
  file.addEventListener("change", async () => {
    err.textContent = ""; blob = null; preview.style.display = "none";
    const f = file.files?.[0]; if (!f) return;
    try { blob = await resizeImage(f); preview.src = URL.createObjectURL(blob); preview.style.display = "block"; }
    catch (e) { err.textContent = e.message === "tooBig" ? "That file is too big (max 10 MB before resize)." : "That image couldn't be read."; }
  });
  const save = el("button", { class: "btn primary", type: "button", text: "Save" });
  const cancel = el("button", { class: "btn ghost", type: "button", text: "Cancel" });
  const sheet = openSheet({ title: "Add a moment", content: el("div", {}, [
    el("label", { text: "Caption" }), caption, counter,
    el("label", { text: "Photo (optional)" }), file, preview, err,
    el("div", { class: "actions" }, [save, cancel]),
  ]) });
  cancel.addEventListener("click", sheet.close);
  save.addEventListener("click", async () => {
    if (!caption.value.trim() && !blob) { err.textContent = "Add a caption or a photo."; return; }
    save.disabled = true;
    try {
      const photoPath = blob ? await store.uploadPhoto(blob, uuid()) : null;
      const row = await store.addMemory({ kind: "moment", caption: caption.value.trim() || null, photoPath, happenedAt: Date.now() });
      sheet.close(); toast?.("Moment saved."); onSaved?.(row);
    } catch (e) { err.textContent = "Couldn't save: " + (e.message ?? e); save.disabled = false; }
  });
}
