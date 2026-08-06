"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import { ar } from "@/lib/i18n/ar";

export type LoginState = {
  error: string | null;
};

// Only same-site paths. An open redirect here would let an invitation link be
// rewritten to bounce a freshly authenticated user somewhere hostile.
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

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
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The active-org choice belongs to the session that just ended; leaving it
  // behind would preselect one account's workspace for whoever signs in next
  // on this device.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);
  redirect("/login");
}
