"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/lib/auth-cookies";
import { safeNext } from "@/lib/redirects";
import { passwordSchema } from "@/lib/validations/auth";
import { ar } from "@/lib/i18n/ar";

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

// ============================================================
// Passwords
// ============================================================

export type PasswordState = { error: string | null; done: boolean };

const failed = (error: string): PasswordState => ({ error, done: false });

function passwordError(error: AuthError): string {
  if (error.code === "same_password") return ar.auth.errors.samePassword;
  if (error.code === "weak_password") return ar.auth.errors.weakPassword;
  if (error.status === 429) return ar.auth.errors.rateLimited;
  return ar.auth.errors.serverError;
}

// New password + confirmation, validated the same way everywhere.
function readNewPassword(formData: FormData): { password: string } | { error: string } {
  const password = String(formData.get("password") ?? "");
  if (!passwordSchema.safeParse(password).success) return { error: ar.auth.errors.passwordTooShort };
  if (password !== String(formData.get("confirm") ?? "")) return { error: ar.auth.errors.passwordMismatch };
  return { password };
}

// "Forgot password": Supabase emails a recovery link that returns through
// /auth/callback (PKCE, so it must be opened in this browser). The answer is
// the same whether or not the address has an account.
export async function requestPasswordReset(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const email = z.email().max(200).safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return failed(ar.auth.errors.emailInvalid);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password&via=recovery`,
    });
    if (error) {
      if (error.status === 429) return failed(ar.auth.errors.rateLimited);
      console.error("password reset request failed:", error.code ?? error.message);
      return failed(ar.auth.errors.serverError);
    }
  } catch (err) {
    console.error("password reset request failed:", err instanceof Error ? err.message : err);
    return failed(ar.auth.errors.serverError);
  }
  return { error: null, done: true };
}

// The recovery link's landing. /auth/callback has already exchanged the link
// for a session and set RECOVERY_COOKIE; without that cookie this is not a
// recovery, and a signed-in user changes their password with the current one
// instead (changePassword).
export async function setNewPassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const cookieStore = await cookies();
  if (!cookieStore.get(RECOVERY_COOKIE)) return failed(ar.auth.forgot.linkExpired);

  const next = readNewPassword(formData);
  if ("error" in next) return failed(next.error);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return failed(ar.auth.forgot.linkExpired);
    const { error } = await supabase.auth.updateUser({ password: next.password });
    if (error) return failed(passwordError(error));
  } catch (err) {
    console.error("password reset failed:", err instanceof Error ? err.message : err);
    return failed(ar.auth.errors.serverError);
  }

  cookieStore.delete(RECOVERY_COOKIE);
  return { error: null, done: true };
}

// Signed in: prove the current password before setting a new one, so a
// session left open on a shared computer cannot take the account over.
export async function changePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const current = String(formData.get("current") ?? "");
  if (!current) return failed(ar.auth.errors.wrongCurrentPassword);
  const next = readNewPassword(formData);
  if ("error" in next) return failed(next.error);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return failed(ar.auth.errors.serverError);

    const { error: proofError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (proofError) {
      return failed(
        proofError.status === 429 ? ar.auth.errors.rateLimited : ar.auth.errors.wrongCurrentPassword
      );
    }
    const { error } = await supabase.auth.updateUser({ password: next.password });
    if (error) return failed(passwordError(error));
  } catch (err) {
    console.error("password change failed:", err instanceof Error ? err.message : err);
    return failed(ar.auth.errors.serverError);
  }
  return { error: null, done: true };
}
