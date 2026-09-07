import { type EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/config";

/**
 * Technical Auth Callback Endpoint.
 * Exchanges PKCE authorization code or token hash for a persistent session cookie.
 * Supports email signup verification, magic links, and password recovery.
 *
 * Hardened for:
 * 1. Cross-browser / cross-device link clicks (missing PKCE code_verifier).
 * 2. Automated email scanner / antivirus pre-fetching (otp_expired).
 * 3. token_hash and token parameter variants.
 * 4. Dual OTP type fallback (email vs signup).
 * 5. Explicit Set-Cookie header attachment on NextResponse.redirect.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash") || requestUrl.searchParams.get("token");
  const rawType = requestUrl.searchParams.get("type");
  const rawNext = requestUrl.searchParams.get("next");
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");

  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/auth/confirmed";

  // Resolve base origin (accounting for reverse proxies / load balancers)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const origin =
    isLocalEnv || !forwardedHost
      ? requestUrl.origin
      : `https://${forwardedHost.split(",")[0].trim()}`;

  const isConfirmationFlow = next === "/auth/confirmed" || !rawNext;

  // Check for upstream Supabase errors passed in URL (e.g. from mail scanners or pre-fetch)
  if (errorCode === "otp_expired" || errorDescription?.toLowerCase().includes("expired")) {
    return NextResponse.redirect(`${origin}/login?notice=link-used-or-expired`);
  }

  const cookieStore = await cookies();
  const cookiesToSetOnRedirect: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Safe ignore in environments where cookieStore is read-only
          }
          cookiesToSetOnRedirect.push({ name, value, options });
        });
      },
    },
  });

  // Helper to ensure all session cookies are attached to the redirect response
  function redirectWithCookies(targetPath: string): NextResponse {
    const destination = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
    const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
    cookiesToSetOnRedirect.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return redirectResponse;
  }

  // 1. Check if user is ALREADY authenticated with a confirmed email on this browser
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email_confirmed_at) {
      return redirectWithCookies(next);
    }
  } catch {
    // Ignore and proceed with explicit code / token exchange
  }

  // 2. Handle PKCE authorization code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectWithCookies(next);
    }

    const errMessage = error.message?.toLowerCase() || "";
    const isPkceVerifierMismatch =
      errMessage.includes("both auth code and code verifier should be non-empty") ||
      errMessage.includes("code verifier") ||
      errMessage.includes("invalid_grant");

    // If exchange failed due to PKCE verifier mismatch across devices/browsers:
    // In Supabase, the email was ALREADY confirmed when {{ .ConfirmationURL }} was requested.
    // Only session creation failed on this secondary browser.
    if (isConfirmationFlow && isPkceVerifierMismatch) {
      return redirectWithCookies("/auth/confirmed");
    }

    // Try fallback: in case the query param 'code' was actually an OTP token hash
    const typeToTry = (rawType || (isConfirmationFlow ? "email" : "recovery")) as EmailOtpType;
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: code,
      type: typeToTry,
    });
    if (!otpError) {
      return redirectWithCookies(next);
    }
  }

  // 3. Handle token_hash / token exchange (SSR recommended flow)
  if (tokenHash) {
    const typesToTry: EmailOtpType[] = rawType
      ? [rawType as EmailOtpType]
      : isConfirmationFlow
      ? ["email", "signup"]
      : ["recovery", "email"];

    for (const otpType of typesToTry) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (!error) {
        return redirectWithCookies(next);
      }
    }
  }

  // 4. If this was a confirmation attempt and we hit a consumed/expired link:
  if (isConfirmationFlow) {
    return NextResponse.redirect(`${origin}/login?notice=link-used-or-expired`);
  }

  // 5. For other failures (e.g. password recovery with expired token), redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}

