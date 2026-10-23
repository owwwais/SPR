import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE } from "@/lib/auth-cookies";
import { safeNext } from "@/lib/redirects";

// Where Supabase Auth returns the user — from Google, from the link in a
// signup confirmation email (`via=email`) and from a password-recovery link
// (`via=recovery`). Exchanging the one-time code sets the session cookies and
// sends the user on to `next`: /onboarding, which routes by the rows the
// account has, /onboarding/seeker when they signed up on the seeker tab, or
// /reset-password after a recovery link.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Every link that lands here was built on the configured site URL
  // (siteOrigin() in the auth actions), so the session cookies are set on
  // that origin and the redirect must stay on it. request.nextUrl reports
  // the server's own idea of its host, which behind a proxy (or in `next
  // dev`) can differ, and the next page would then see no session.
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  const code = searchParams.get("code");
  const viaRecovery = searchParams.get("via") === "recovery";
  const next = viaRecovery ? "/reset-password" : safeNext(searchParams.get("next"), "/onboarding");
  const viaEmail = searchParams.get("via") === "email";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (viaRecovery) {
          (await cookies()).set(RECOVERY_COOKIE, "1", {
            httpOnly: true,
            secure: origin.startsWith("https:"),
            sameSite: "lax",
            path: "/",
            maxAge: RECOVERY_COOKIE_MAX_AGE,
          });
        }
        return NextResponse.redirect(new URL(next, origin));
      }
      console.error("auth code exchange failed:", error.message);
    } catch (err) {
      console.error("auth code exchange failed:", err instanceof Error ? err.message : err);
    }
  }

  // A recovery link that cannot be used — expired, used already, or opened
  // in a browser that did not ask for it (the PKCE verifier lives where the
  // request was made). Nothing changed; ask for a new one.
  if (viaRecovery) {
    return NextResponse.redirect(new URL("/forgot-password?error=link_expired", origin));
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
