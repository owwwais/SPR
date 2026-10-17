"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirects";
import { ar } from "@/lib/i18n/ar";

export type SignupState = {
  error: string | null;
  // Supabase may or may not create a session immediately, depending on
  // whether email confirmation is switched on for the project. Both are
  // valid; the form shows a different screen for each.
  awaitingConfirmation: boolean;
};

const signupSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(72),
});

// Where the new account goes once it is confirmed. The tab is a routing
// hint and nothing more (D26): it is not stored, not written to
// user_metadata, and grants nothing — /onboarding routes by the rows the
// account actually has. An explicit same-site `next` (an invitation link)
// outranks the tab.
function signupTarget(as: FormDataEntryValue | null, next: FormDataEntryValue | null): string {
  const explicit = safeNext(next, "");
  if (explicit) return explicit;
  return as === "seeker" ? "/onboarding/seeker" : "/onboarding";
}

// The configured site URL wins; the request host is a development fallback.
// Supabase only honours a redirect on its allow list either way.
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUp(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: ar.auth.errors.signupInvalid, awaitingConfirmation: false };
  }

  const target = signupTarget(formData.get("as"), formData.get("next"));

  let hasSession = false;
  try {
    const supabase = await createClient();
    // The confirmation link returns through /auth/callback, which exchanges
    // its one-time code for a session. `via=email` lets the callback tell a
    // failed exchange (the link opened in another browser — the address is
    // confirmed all the same) from a failed Google sign-in.
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(target)}&via=email`,
      },
    });

    if (error) {
      // Supabase returns the same shape for "already registered" as for other
      // failures depending on settings; treat a known duplicate specially and
      // never reveal anything else about an existing account.
      const duplicate = error.message.toLowerCase().includes("already");
      return {
        error: duplicate
          ? ar.auth.errors.emailTaken
          : ar.auth.errors.serverError,
        awaitingConfirmation: false,
      };
    }
    hasSession = data.session !== null;
  } catch (err) {
    // Never log credentials.
    console.error("signUp failed:", err instanceof Error ? err.message : err);
    return { error: ar.auth.errors.serverError, awaitingConfirmation: false };
  }

  // Confirmation off: straight to the first onboarding step.
  if (hasSession) redirect(target);

  return { error: null, awaitingConfirmation: true };
}
