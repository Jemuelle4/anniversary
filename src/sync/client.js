// Supabase JS client via ESM CDN; loaded only when config has a URL.
let clientPromise = null;
export function hasSupabaseConfig(config) {
  return !!(config?.SUPABASE_URL && config?.SUPABASE_ANON_KEY);
}
export function getClient(config) {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }));
  }
  return clientPromise;
}
export async function ensureAnonSession(client) {
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
