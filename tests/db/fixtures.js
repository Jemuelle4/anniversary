// Valid states for DB tests, built from the real game factories.
import { createInitialState } from "../../src/game/state.js";
export function initialState(now = 0) { return createInitialState(now, 1); }
export function withNeed(state, need, value) { return { ...state, needs: { ...state.needs, [need]: value } }; }
