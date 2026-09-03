export interface OwnerContext {
  readonly ownerId: string;
}

/**
 * Clean server-side owner authentication boundary.
 * Route handlers interact ONLY with this function and have zero knowledge
 * of specific auth mechanisms or tokens.
 */
export async function getAuthenticatedOwner(request: Request): Promise<OwnerContext | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  // If Supabase Auth is configured, check JWT from Authorization or Cookie header
  if (supabaseUrl) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
            Authorization: `Bearer ${jwt}`,
          },
        });
        if (userRes.ok) {
          const user = (await userRes.json()) as { id: string };
          if (user && user.id) {
            return { ownerId: user.id };
          }
        }
      } catch {
        // Fall through on network error
      }
    }
  }

  // Test environment fallback: only active when NODE_ENV === "test"
  if (process.env.NODE_ENV === "test") {
    const devHeader = request.headers.get("X-Test-Owner-Id");
    if (devHeader) {
      return { ownerId: devHeader };
    }
    return { ownerId: "test_owner_default" };
  }

  // Local development fallback: only active when NODE_ENV === "development" and Supabase is not configured
  if (process.env.NODE_ENV === "development" && !supabaseUrl) {
    return { ownerId: "dev_owner_default" };
  }

  // In production (or when auth is required): unauthenticated requests are rejected
  return null;
}
