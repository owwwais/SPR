import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { hasSupabaseEnv, getSupabaseEnv } from "./env";

// Refreshes the Supabase session cookie and applies optimistic redirects.
// This is NOT the authorization boundary — RLS and the server-side role
// gate in lib/auth.ts are (CLAUDE.md D7).
export async function updateSession(request: NextRequest) {
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
  if (user && pathname === "/login") {
    return redirectTo("/admin");
  }

  return supabaseResponse;
}
