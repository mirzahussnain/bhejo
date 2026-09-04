import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "./config";

/**
 * Creates a browser-side Supabase client for Client Components.
 * Uses public environment variables only.
 */
export function createClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
