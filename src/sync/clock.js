/** Client clock corrected by a server offset. `fetchServerNow` returns ms epoch. */
export function createClock(fetchServerNow) {
  let offset = 0;
  return {
    now: () => Date.now() + offset,
    offset: () => offset,
    async sync() {
      if (!fetchServerNow) return offset;
      try {
        const t0 = Date.now();
        const server = await fetchServerNow();
        const t1 = Date.now();
        if (Number.isFinite(server)) offset = server - (t0 + (t1 - t0) / 2);
      } catch { /* keep the previous offset */ }
      return offset;
    },
  };
}
