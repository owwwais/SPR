import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// D17: public tenant routing is path-first (/c/{slug}); a subdomain is just a
// nicer spelling of the same page, rewritten here so no page component ever
// has to know which of the two a visitor used.
//
// The slug is NOT trusted because it came from the host — it is passed to
// /c/{slug}, where the page looks the organization up and 404s if there is
// none. A made-up subdomain therefore renders not-found, never another
// tenant's page.
function rewriteSubdomain(request: NextRequest): NextResponse | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!rootDomain) return null;

  const host = (request.headers.get("host") ?? "")
    .split(":")[0]!
    .toLowerCase();
  if (
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    !host.endsWith(`.${rootDomain}`)
  ) {
    return null;
  }

  const slug = host.slice(0, -(rootDomain.length + 1));
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return null;
  // Platform surfaces, not tenants. The same names are rejected by the slug
  // CHECK constraint (0006), so this is belt and braces.
  if (["app", "api", "admin", "platform", "www"].includes(slug)) return null;

  // Only the subdomain's front page is the careers page. Every other path —
  // a job and its apply form, tracking, sign-in — is a site-wide route keyed
  // by its own id, and the careers page links to them as such. Prefixing
  // them with /c/{slug} sent each one to a route that does not exist (KD-04).
  if (request.nextUrl.pathname !== "/") return null;

  const url = request.nextUrl.clone();
  url.pathname = `/c/${slug}`;
  return NextResponse.rewrite(url);
}

export async function proxy(request: NextRequest) {
  const rewritten = rewriteSubdomain(request);
  if (rewritten) return rewritten;

  return updateSession(request);
}

export const config = {
  // Auth-relevant routes, plus the paths a subdomain visitor can land on.
  // Public pages under the root domain still skip session refresh — running
  // it there added a Supabase Auth round trip to every public navigation,
  // including ISR-cached hits. The authoritative gate stays server-side in
  // lib/auth.ts (D7); rewriteSubdomain() returns before any of that.
  // The seeker side (D26) — the CV-first onboarding and the /me portal —
  // signs in like the workspace does, so its sessions refresh here too.
  matcher: [
    "/admin/:path*",
    "/platform/:path*",
    "/login",
    "/signup",
    "/onboarding/:path*",
    "/me/:path*",
    "/invite/:path*",
    "/",
    "/jobs/:path*",
    "/track/:path*",
  ],
};
