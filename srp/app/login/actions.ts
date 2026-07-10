"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ar } from "@/lib/i18n/ar";

export type LoginState = {
  error: string | null;
};

export async function signIn(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: ar.auth.errors.invalidInput };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      return { error: ar.auth.errors.invalidCredentials };
    }
  } catch (err) {
    // e.g. Supabase env not configured yet. Never log credentials.
    console.error("signIn failed:", err instanceof Error ? err.message : err);
    return { error: ar.auth.errors.serverError };
  }

  // Outside try/catch: redirect() works by throwing.
  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
