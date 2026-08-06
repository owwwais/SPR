"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

  let hasSession = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/onboarding`
          : undefined,
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

  // Confirmation off: straight into naming the company.
  if (hasSession) redirect("/onboarding");

  return { error: null, awaitingConfirmation: true };
}
