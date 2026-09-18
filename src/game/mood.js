import { MOOD_THRESHOLDS, MOOD_WEIGHTS, NEEDS, NEED_ICONS, THOUGHT_BELOW } from "./constants.js";

export const MOOD_WORDS = { sleeping: "Sleeping", ecstatic: "Ecstatic", happy: "Happy", okay: "Okay", meh: "Meh", sulky: "Sulky" };
const ORDER = ["sulky", "meh", "okay", "happy", "ecstatic"];

export function moodFor(state) {
  const n = state.needs;
  let lowest = NEEDS[0];
  for (const k of NEEDS) if (n[k] < n[lowest]) lowest = k;
  const score = NEEDS.reduce((s, k) => s + MOOD_WEIGHTS[k] * n[k], 0);
  let mood = score >= MOOD_THRESHOLDS.ecstatic ? "ecstatic"
    : score >= MOOD_THRESHOLDS.happy ? "happy"
    : score >= MOOD_THRESHOLDS.okay ? "okay"
    : score >= MOOD_THRESHOLDS.meh ? "meh" : "sulky";
  const min = n[lowest];
  if (min < 10) mood = "sulky";
  else if (min < 20 && ORDER.indexOf(mood) > ORDER.indexOf("meh")) mood = "meh";
  if (state.asleep) mood = "sleeping";
  const thought = !state.asleep && min < THOUGHT_BELOW ? NEED_ICONS[lowest] : null;
  return { mood, score, lowestNeed: lowest, thought, word: MOOD_WORDS[mood] };
}
