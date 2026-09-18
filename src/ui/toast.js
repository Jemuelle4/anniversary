export function createToast(el) {
  let timer = null;
  return {
    show(text) {
      if (!text) return;
      clearTimeout(timer);
      el.textContent = text; el.classList.add("show");
      timer = setTimeout(() => { el.classList.remove("show"); timer = null; }, 1800);
    },
  };
}
