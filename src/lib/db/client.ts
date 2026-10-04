import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

let client: SupabaseClient | null = null;

/** Server-side Supabase client using the service role (asmt_* tables are RLS-locked to it). */
export function db(): SupabaseClient {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = config();
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
