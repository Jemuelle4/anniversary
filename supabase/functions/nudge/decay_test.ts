// deno test supabase/functions/nudge/decay_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decayNeeds } from "./decay.ts";
const { vectors } = JSON.parse(await Deno.readTextFile(new URL("../../../tests/fixtures/decay-vectors.json", import.meta.url)));
for (const v of vectors) {
  Deno.test(`decay vector: ${v.name}`, () => {
    const out = decayNeeds(v.before, v.asleep, v.elapsedHours);
    const rounded = Object.fromEntries(Object.entries(out).map(([k, x]) => [k, Math.round(x as number)]));
    assertEquals(rounded, v.after);
  });
}
