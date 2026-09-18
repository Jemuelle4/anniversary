export const TOASTS = {
  "feed.ok": "Nom. Plush is fuller.",
  "feed.stuffed": "Plush is stuffed.",
  "feed.asleep": "Shh. Plush is asleep.",
  "cuddle.ok": "Plush feels loved.",
  "cuddle.asleep": "Shh. Plush is asleep.",
  "play.ok": "Wheee!",
  "play.tooTired": "Plush is too tired to play.",
  "play.asleep": "Shh. Plush is asleep.",
  "nibble.ok": "Nibble. Plush is unbothered. Mostly.",
  "nibble.eaten": "You ate Plush. Plush is back. Plush remembers.",
  "nibble.asleep": "Shh. Plush is asleep.",
  "boom.ok": "BOOM. Plush reassembles.",
  "boom.tooTired": "No energy for a boom.",
  "boom.cooldown": "Boom is recharging.",
  "boom.asleep": "Shh. Plush is asleep.",
  "sleep.ok": "Shh. Plush is sleeping.",
  "sleep.asleep": "Plush is already asleep.",
  "wake.rested": "Plush woke up rested.",
  "wake.grumpy": "Plush is grumpy.",
  "wake.awake": "Plush is already awake.",
  "reset.done": "A brand new Plush.",
  "streak.freeze": "Plush understood. Streak kept.",
  "offline.queued": "Saved. Plush will sync when you're back online.",
  "private.mode": "Private mode: Plush won't be remembered on this device.",
  "clock.off": "Your device clock is off; Plush used server time.",
  "sync.reloaded": "Something went wrong; reloaded Plush.",
};

export const VERBS = {
  feed: "fed Plush", cuddle: "cuddled Plush", play: "played with Plush", nibble: "nibbled Plush",
  boom: "boomed Plush", sleep: "tucked Plush in", wake: "woke Plush up", join: "joined",
  reset: "reset Plush", migrate: "brought their Plush over", settings: "changed settings",
};
export function verbFor(row) {
  if (row.type === "nibble" && row.payload?.seed != null) return "ate Plush whole";
  return VERBS[row.type] ?? row.type;
}
export const RITUAL_LABELS = { breakfast: "Breakfast", playtime: "Playtime", goodnight: "Goodnight" };
