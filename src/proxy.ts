import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const isEmailConfirmed = Boolean(user?.email_confirmed_at);

  // Protected routes: /dashboard and sub-paths
  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(url);
    }
    if (!isEmailConfirmed) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/verify-email";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Auth pages: redirect authenticated users according to email confirmation status
  if (pathname === "/login" || pathname === "/signup") {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = isEmailConfirmed ? "/dashboard" : "/auth/verify-email";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Verify email gate page: only accessible by authenticated users with unconfirmed email
  if (pathname === "/auth/verify-email") {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (isEmailConfirmed) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - Public images and assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .wasm)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm)$).*)",
  ],
};
