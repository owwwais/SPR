import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { UserRole } from "@/types/database";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
};

// Authoritative server-side auth check (data access layer). Memoized per
// request so layouts and pages can each call it without extra round trips.
export const getProfile = cache(async (): Promise<Profile | null> => {
  // Supabase not configured yet (scaffold state): nobody is authenticated,
  // so every /admin route redirects to /login.
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  return profile;
});

// Every /admin page and layout must go through this gate. A session without
// a profiles row has no dashboard access (public sign-up is disabled, so
// this only happens for orphaned auth users).
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}
