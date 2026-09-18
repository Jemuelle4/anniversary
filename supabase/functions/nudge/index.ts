// Hourly reminder function (docs/phase-4 §3). Deploy: supabase functions deploy nudge
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:), plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (provided).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { decayNeeds } from "./decay.ts";

const LINES: Record<string, string> = { fullness: "Plush is hungry", fun: "Plush is bored", love: "Plush misses you", energy: "Plush is exhausted" };
const MIN_GAP_MS = 8 * 3600_000, QUIET_EVENT_MS = 2 * 3600_000, THRESHOLD = 30;

function localHour(now: Date, tz: string): number {
  try { return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now)); } catch { return now.getUTCHours(); }
}
function inQuiet(hour: number, start: number, end: number) { return start > end ? hour >= start || hour < end : hour >= start && hour < end; }

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:plush@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const now = new Date();
  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, keys, quiet_start, quiet_end, last_sent_at, home_id, partner_id");
  if (error) return new Response(error.message, { status: 500 });
  const homes = [...new Set((subs ?? []).map((s) => s.home_id))];
  let sent = 0, removed = 0;
  for (const homeId of homes) {
    const { data: home } = await supabase.from("homes").select("id, timezone").eq("id", homeId).single();
    const { data: st } = await supabase.from("plush_state").select("state, updated_at").eq("home_id", homeId).single();
    if (!home || !st) continue;
    const state = st.state;
    if (state.asleep) continue;
    const elapsedH = (now.getTime() - Date.parse(st.updated_at)) / 3600_000;
    const needs = decayNeeds(state.needs, false, elapsedH);
    const lowest = (Object.keys(needs) as (keyof typeof needs)[]).reduce((a, b) => (needs[b] < needs[a] ? b : a));
    if (needs[lowest] >= THRESHOLD) continue;
    const { data: lastEv } = await supabase.from("plush_events").select("created_at, partner_id").eq("home_id", homeId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (lastEv && now.getTime() - Date.parse(lastEv.created_at) < QUIET_EVENT_MS) continue;
    const { data: partners } = await supabase.from("partners").select("id, name").eq("home_id", homeId);
    const hour = localHour(now, home.timezone);
    for (const sub of (subs ?? []).filter((s) => s.home_id === homeId)) {
      if (inQuiet(hour, sub.quiet_start, sub.quiet_end)) continue;
      if (sub.last_sent_at && now.getTime() - Date.parse(sub.last_sent_at) < MIN_GAP_MS) continue;
      let body = LINES[lowest];
      if (lastEv && lastEv.partner_id !== sub.partner_id) {
        const who = partners?.find((p) => p.id === lastEv.partner_id)?.name;
        const ago = Math.round((now.getTime() - Date.parse(lastEv.created_at)) / 3600_000);
        if (who) body += ` · ${who} was here ${ago}h ago`;
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: "Plush needs you", body, url: "/surprise.html" }));
        await supabase.from("push_subscriptions").update({ last_sent_at: now.toISOString() }).eq("id", sub.id);
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) { await supabase.from("push_subscriptions").delete().eq("id", sub.id); removed++; }
        else console.error("push failed", sub.id, e);
      }
    }
  }
  return new Response(JSON.stringify({ sent, removed, homes: homes.length }), { headers: { "content-type": "application/json" } });
});
