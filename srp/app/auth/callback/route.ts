import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";

// Where Google (through Supabase Auth) returns the user. Exchanging the
// one-time code sets the session cookies; a missing code means the user
// cancelled or the provider refused, and the login page says so.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/onboarding");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
      console.error("oauth code exchange failed:", error.message);
    } catch (err) {
      console.error("oauth code exchange failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", origin));
}
