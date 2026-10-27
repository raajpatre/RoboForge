import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 Proxy (formerly middleware) — guards /admin routes.
 *
 * Note from Next.js docs: "Always verify authentication and authorization
 * inside each Server Function rather than relying on Proxy alone."
 *
 * This proxy provides a fast, edge-level redirect for unauthenticated
 * visitors to /admin. The authoritative check is still enforced in
 * requireAdminUser() inside every Server Action and Server Component.
 *
 * Server Functions (Server Actions) are handled as POST requests to the route
 * where they are used, so a Proxy matcher that excludes a path will also
 * skip Server Function calls on that path — auth inside Server Actions is the
 * real enforcement layer.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard /admin paths (login page is public)
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Read Supabase credentials from environment at edge runtime.
  // We use the public anon key here — the proxy only checks for an
  // active session cookie, not service-role permissions.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Placeholder / test mode: allow through without session verification.
  // The server-side requireAdminUser() guard inside each page/action is
  // the authoritative check — it mocks admin in placeholder environments.
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes("placeholder") ||
    supabaseAnonKey.includes("placeholder")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create a lightweight Supabase client bound to the current request cookies.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() performs a lightweight JWT validation against the Supabase Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No active session — redirect to admin login.
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists. The authoritative email allowlist check happens inside
  // requireAdminUser() in every Server Component and Server Action.
  return response;
}

export const config = {
  matcher: [
    // Run on all /admin paths
    "/admin/:path*",
  ],
};
