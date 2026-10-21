"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import { safeNext } from "@/lib/redirects";
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

  // Outside try/catch: redirect() works by throwing. /onboarding routes
  // everyone by the rows they have: a workspace to /admin, a seeker profile
  // to /me or its next step, neither to the chooser (D26).
  redirect(safeNext(formData.get("next"), "/onboarding"));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // This browser only. The default ("global") revokes every session the
  // account has, so signing out on a phone ended the session on a laptop
  // mid-task, and its next save failed.
  await supabase.auth.signOut({ scope: "local" });
  // The active-org choice belongs to the session that just ended; leaving it
  // behind would preselect one account's workspace for whoever signs in next
  // on this device.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);
  redirect("/login");
}
