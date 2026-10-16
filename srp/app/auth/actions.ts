"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";

// The configured site URL wins; the request host is a development fallback.
// Supabase only honours a redirect on its allow list either way, and the
// PKCE verifier cookie only exists on this site, so a spoofed host cannot
// turn this into an open redirect.
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// "Continue with Google". Supabase runs the PKCE flow: this action gets the
// provider URL (and sets the verifier cookie), Google sends the user back to
// /auth/callback, which exchanges the code for a session.
export async function signInWithGoogle(formData: FormData): Promise<void> {
  // /onboarding is the right landing either way: it forwards to /admin when
  // a workspace exists and asks for one when it does not.
  const next = safeNext(formData.get("next"), "/onboarding");
  const origin = await siteOrigin();

  let url: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) console.error("google oauth start failed:", error.message);
    url = data.url ?? null;
  } catch (err) {
    console.error("google oauth start failed:", err instanceof Error ? err.message : err);
  }

  redirect(url ?? "/login?error=oauth");
}
