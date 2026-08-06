"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import type { MemberRole } from "@/types/database";

export type SettingsState = { saved: boolean; error: string | null };

// The single `settings` row is gone (0006): company name and retention are
// per-organization now, and the team lives in `memberships`. Every action
// here scopes to the caller's own org id AND is gated by RLS — two layers,
// per the isolation invariant (§2.1).

const orgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  retention_months: z.coerce.number().int().min(1).max(60),
});

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await requireOrgAdmin();

  const parsed = orgSchema.safeParse({
    name: formData.get("company_name"),
    retention_months: formData.get("retention_months"),
  });
  if (!parsed.success) {
    return { saved: false, error: ar.settingsPage.failed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", session.org.id);
  if (error) {
    console.error("updateSettings failed:", error.message);
    return { saved: false, error: ar.settingsPage.failed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}

const newMemberSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(72),
  role: z.enum(["owner", "admin", "hr", "viewer"]),
});

// Team account creation. The privileged work happens in the manage-users
// Edge Function (the service role lives only there — D3/D7); this action
// relays the request with the admin's own JWT, which the function
// re-verifies against the organization through org_role().
export async function createMember(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await requireOrgAdmin();

  const parsed = newMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { saved: false, error: ar.settingsPage.addMember.invalid };
  }
  // Mirrors the memberships policy: only an owner may mint another owner.
  if (parsed.data.role === "owner" && session.role !== "owner") {
    return { saved: false, error: ar.settingsPage.addMember.ownerOnly };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: { action: "create", org_id: session.org.id, ...parsed.data },
  });
  if (error) {
    // Read the function's structured error when available.
    let detail = "";
    try {
      const context = (error as { context?: Response }).context;
      if (context) detail = ((await context.json()) as { error?: string }).error ?? "";
    } catch {
      // ignore body parse issues
    }
    console.error("createMember failed:", error.message, detail);
    return {
      saved: false,
      error:
        detail === "email exists" || detail === "already a member"
          ? ar.settingsPage.addMember.duplicate
          : ar.settingsPage.addMember.failed,
    };
  }
  if (!data?.ok) {
    return { saved: false, error: ar.settingsPage.addMember.failed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}

const ROLES: MemberRole[] = ["owner", "admin", "hr", "viewer"];

export async function updateMemberRole(
  memberId: string,
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await requireOrgAdmin();
  if (memberId === session.userId) {
    return { saved: false, error: ar.settingsPage.roleFailed };
  }

  const role = String(formData.get("role") ?? "") as MemberRole;
  if (!ROLES.includes(role)) {
    return { saved: false, error: ar.settingsPage.roleFailed };
  }
  if (role === "owner" && session.role !== "owner") {
    return { saved: false, error: ar.settingsPage.addMember.ownerOnly };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("org_id", session.org.id)
    .eq("user_id", memberId);
  if (error) {
    console.error("updateMemberRole failed:", error.message);
    return { saved: false, error: ar.settingsPage.roleFailed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}

// Removing a member detaches them from THIS organization only — their
// account, and any membership they hold elsewhere, are untouched (D14).
export async function removeMember(memberId: string): Promise<SettingsState> {
  const session = await requireOrgAdmin();
  if (memberId === session.userId) {
    return { saved: false, error: ar.settingsPage.removeFailed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("org_id", session.org.id)
    .eq("user_id", memberId);
  if (error) {
    // The database refuses to leave an organization without an owner (0006).
    console.error("removeMember failed:", error.message);
    return { saved: false, error: ar.settingsPage.removeFailed };
  }

  revalidatePath("/admin/settings");
  return { saved: true, error: null };
}
