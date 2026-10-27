import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServerEnv } from "@/lib/env";

/**
 * Creates a privileged Supabase client using the Service Role Key.
 *
 * CRITICAL SECURITY NOTICE:
 * - This client BYPASSES Row Level Security (RLS).
 * - MUST ONLY be used on the server in authorized routes, webhooks, or background tasks.
 * - NEVER import or expose to browser client components.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("SECURITY FAULT: createAdminClient() invoked on client!");
  }

  const env = getServerEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
