/**
 * Sanitizes and normalizes the Supabase URL.
 * Strips accidental trailing slashes or '/rest/v1' path segments.
 */
export function normalizeSupabaseUrl(url?: string): string {
  if (!url) return "";
  return url.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getSupabaseUrl(): string {
  return normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

export function getSupabaseSecretKey(): string {
  return (process.env.SUPABASE_SECRET_KEY || "").trim();
}
