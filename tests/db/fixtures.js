// Minimal valid states for DB tests. Real state shapes come from src/game once phase 1 exists.
export function initialState(now = 0) {
  return {
    version: 2, createdAt: now, updatedAt: now,
    needs: { fullness: 80, fun: 80, love: 80, energy: 100 },
    asleep: false, sleepStartedAt: null,
    bites: { seed: 1, count: 0 }, cooldowns: { boom: 0 }, lastAction: null,
    counters: { feed: 0, cuddle: 0, play: 0, nibble: 0, boom: 0, sleep: 0, wake: 0, eaten: 0 },
  };
}
export function withNeed(state, need, value) {
  return { ...state, needs: { ...state.needs, [need]: value } };
}
