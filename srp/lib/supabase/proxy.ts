import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { hasSupabaseEnv, getSupabaseEnv } from "./env";

// Paths that only appear in the matcher so the subdomain rewrite can see
// them. They carry no session, so refreshing one costs a Supabase round trip
// per public navigation for nothing.
const PUBLIC_PREFIXES = ["/jobs", "/track"];

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}

// Refreshes the Supabase session cookie and applies optimistic redirects.
// This is NOT the authorization boundary — RLS and the server-side gate in
// lib/auth.ts are (CLAUDE.md D7).
export async function updateSession(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  if (!hasSupabaseEnv()) {
    // Supabase not configured yet: let public pages work; the server-side
    // gate still blocks /admin with a clear configuration error.
    return NextResponse.next({ request });
  }

  const { url, anonKey } = getSupabaseEnv();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and auth.getUser():
  // it can cause hard-to-debug session desync issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    const response = NextResponse.redirect(target);
    // Preserve any refreshed session cookies on the redirect.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (!user && pathname.startsWith("/admin")) {
    return redirectTo("/login");
  }
  // /onboarding needs a session but NOT a membership — that is exactly the
  // state it exists to resolve, so it is not treated like /admin here.
  if (!user && pathname === "/onboarding") {
    return redirectTo("/login");
  }
  if (user && (pathname === "/login" || pathname === "/signup")) {
    // An explicit ?next (an invitation link, say) is the user's destination
    // and outranks this convenience redirect; the page honours it itself.
    if (!request.nextUrl.searchParams.has("next")) {
      // Where they belong depends on whether they have a workspace yet, which
      // this layer deliberately does not know: /onboarding forwards on to
      // /admin when a membership exists (D7 — the real gate is server-side).
      return redirectTo("/onboarding");
    }
  }

  return supabaseResponse;
}
