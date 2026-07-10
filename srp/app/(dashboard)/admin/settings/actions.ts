"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import type { UserRole } from "@/types/database";

export type SettingsState = { saved: boolean; error: string | null };

const settingsSchema = z.object({
  company_name: z.string().trim().max(200),
  retention_months: z.coerce.number().int().min(1).max(60),
});

// Admin-only (RLS: settings update policy requires role = 'admin'; the page
// itself also redirects non-admins).
export async function updateSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { saved: false, error: ar.settingsPage.failed };
  }

  const parsed = settingsSchema.safeParse({
    company_name: formData.get("company_name"),
    retention_months: formData.get("retention_months"),
  });
  if (!parsed.success) {
    return { saved: false, error: ar.settingsPage.failed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("id", 1);
  if (error) {
    console.error("updateSettings failed:", error.message);
    return { saved: false, error: ar.settingsPage.failed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}

// Admin-only role management for existing team members. Creating auth users
// requires the service role and stays in the Supabase dashboard (D3/D7).
export async function updateMemberRole(
  memberId: string,
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const profile = await requireProfile();
  if (profile.role !== "admin" || memberId === profile.id) {
    return { saved: false, error: ar.settingsPage.roleFailed };
  }

  const role = String(formData.get("role") ?? "") as UserRole;
  if (role !== "admin" && role !== "hr") {
    return { saved: false, error: ar.settingsPage.roleFailed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", memberId);
  if (error) {
    console.error("updateMemberRole failed:", error.message);
    return { saved: false, error: ar.settingsPage.roleFailed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}
