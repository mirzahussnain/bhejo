import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Technical Auth Callback Endpoint.
 * Exchanges PKCE authorization code or token hash for a persistent session cookie.
 * Supports email signup verification, magic links, and password recovery.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") || "/auth/confirmed";

  // Resolve base origin (accounting for reverse proxies / load balancers)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const origin =
    isLocalEnv || !forwardedHost
      ? requestUrl.origin
      : `https://${forwardedHost.split(",")[0].trim()}`;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Forward to requested destination page (e.g. /auth/confirmed or /auth/update-password)
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : `/${next}`}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : `/${next}`}`);
    }
  }

  // If code exchange failed or no valid credentials were provided, redirect to login with error cue
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
