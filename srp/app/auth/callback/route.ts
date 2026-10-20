import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";

// Where Supabase Auth returns the user — from Google, and from the link in a
// signup confirmation email (`via=email`). Exchanging the one-time code sets
// the session cookies and sends the user on to `next`: /onboarding, which
// routes by the rows the account has, or /onboarding/seeker when they signed
// up on the seeker tab.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/onboarding");
  const viaEmail = searchParams.get("via") === "email";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
      console.error("auth code exchange failed:", error.message);
    } catch (err) {
      console.error("auth code exchange failed:", err instanceof Error ? err.message : err);
    }
  }

  // An expired or already-used confirmation link comes back with an error
  // and no code, and the address is NOT confirmed: say so, rather than
  // telling the person their email is confirmed and then failing their
  // sign-in as a wrong password.
  if (viaEmail && searchParams.get("error_code")) {
    return NextResponse.redirect(new URL("/login?error=link_expired", origin));
  }

  // A confirmation link opened in another browser cannot complete the PKCE
  // exchange (the verifier cookie lives where signup happened), but Supabase
  // confirmed the address before redirecting here. So the login page says
  // "confirmed — please sign in", and keeps `next` so the seeker still lands
  // on their onboarding afterwards.
  if (viaEmail) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", "confirm");
    if (next !== "/onboarding") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  // Otherwise the user cancelled at Google or the provider refused.
  return NextResponse.redirect(new URL("/login?error=oauth", origin));
}
