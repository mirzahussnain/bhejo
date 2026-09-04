import { createServerClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey, getSupabaseSecretKey } from "../supabase/config.ts";

export interface OwnerContext {
  readonly ownerId: string;
  readonly email?: string;
  readonly fullName?: string;
}

/**
 * Clean server-side owner authentication boundary.
 * Route handlers interact ONLY with this function and have zero knowledge
 * of specific auth mechanisms or tokens.
 *
 * Verifies Supabase session either via Bearer JWT or SSR session cookies.
 */
export async function getAuthenticatedOwner(request: Request): Promise<OwnerContext | null> {
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabaseAnonKey();
  const secretKey = getSupabaseSecretKey();

  if (supabaseUrl && (publishableKey || secretKey)) {
    const apiKey = publishableKey || secretKey;

    // 1. Check Authorization header (Bearer JWT)
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${jwt}`,
          },
        });
        if (userRes.ok) {
          const user = (await userRes.json()) as {
            id: string;
            email?: string;
            user_metadata?: { full_name?: string };
          };
          if (user && user.id) {
            return {
              ownerId: user.id,
              email: user.email,
              fullName: user.user_metadata?.full_name,
            };
          }
        }
      } catch {
        // Network failure, fall through
      }
    }

    // 2. Check Cookie header (Supabase SSR session cookies)
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader && publishableKey) {
      try {
        const supabase = createServerClient(supabaseUrl, publishableKey, {
          cookies: {
            getAll() {
              return cookieHeader.split("; ").map((cookieStr) => {
                const eqIdx = cookieStr.indexOf("=");
                if (eqIdx === -1) return { name: cookieStr, value: "" };
                const name = cookieStr.slice(0, eqIdx).trim();
                const value = cookieStr.slice(eqIdx + 1).trim();
                return { name, value: decodeURIComponent(value) };
              });
            },
            setAll() {
              // Read-only inside route handler authentication check
            },
          },
        });

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!error && user && user.id) {
          return {
            ownerId: user.id,
            email: user.email,
            fullName: (user.user_metadata as { full_name?: string } | undefined)?.full_name,
          };
        }
      } catch {
        // Cookie parsing or network failure, fall through
      }
    }
  }

  // Test environment fallback: only active when NODE_ENV === "test"
  if (process.env.NODE_ENV === "test") {
    const devHeader = request.headers.get("X-Test-Owner-Id");
    if (devHeader) {
      return { ownerId: devHeader, email: "test@example.com", fullName: "Test Owner" };
    }
    return { ownerId: "test_owner_default", email: "test@example.com", fullName: "Test Owner Default" };
  }

  // Local development fallback: only active when NODE_ENV === "development" and Supabase is not configured
  if (process.env.NODE_ENV === "development" && !supabaseUrl) {
    return { ownerId: "dev_owner_default", email: "dev@example.com", fullName: "Dev Owner Default" };
  }

  // In production (or when auth is required): unauthenticated requests are rejected
  return null;
}
