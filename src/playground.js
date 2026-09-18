// Playground: the original stateless sandbox, driven by the shared stage module. Nothing here counts.
import { createStage } from "./ui/stage.js";
import { createInitialState } from "./game/state.js";
import { randomSeed } from "./game/rng.js";

export function bootPlayground(root) {
  const stage = createStage(root.querySelector("#stage"));
  const state = createInitialState(Date.now());
  const map = { throw: "play", bite: "nibble", explode: "boom", love: "cuddle" };
  for (const btn of root.querySelectorAll("[data-action]")) {
    btn.addEventListener("click", () => {
      if (btn.dataset.revealed !== "1") { btn.dataset.revealed = "1"; btn.textContent = btn.dataset.label; }
      const type = map[btn.dataset.action]; if (!type) return;
      const effects = [`anim:${type}`];
      if (type === "nibble") { state.bites.count += 1; if (state.bites.count >= 20) { state.bites = { seed: randomSeed(), count: 0 }; effects.push("bites:respawn"); } }
      if (type === "boom") state.bites.count = 0;
      if (type === "cuddle") state.bites.count = Math.max(0, state.bites.count - 5);
      stage.play(effects, state);
    });
  }
}
