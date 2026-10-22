"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";

// The accountless talent journey is superseded by seeker accounts (D26):
// new profiles start at /signup?as=seeker and are written through
// lib/seeker-actions.ts. What remains here serves the profiles created
// before that — their review, manage and public pages keep working
// (/talent/review|manage/[token], /t/[token]) — and for those the public
// token is still the capability: 128 random bits that only ever reached the
// person who completed verification.

export type PublishState = { error: string | null };

export async function publishProfile(
  _prev: PublishState,
  formData: FormData
): Promise<PublishState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return { error: ar.talent.errors.server };
  }

  const years = String(formData.get("years_experience") ?? "").trim();
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("talent_publish_profile", {
    p_token: token,
    p_full_name: String(formData.get("full_name") ?? "").trim() || null,
    p_headline: String(formData.get("headline") ?? "").trim() || null,
    p_city: String(formData.get("city") ?? "").trim() || null,
    p_years: years === "" ? null : Number(years),
    p_about: String(formData.get("about") ?? "").trim() || null,
    p_hidden_skills: formData.getAll("hidden_skills").map(String),
    // Two consents, read separately. Neither implies the other.
    p_consent_public: formData.get("consent_public") === "on",
    p_consent_offers: formData.get("consent_offers") === "on",
    p_noindex: formData.get("noindex") === "on",
  });

  if (error) {
    console.error("talent publish failed:", error.message);
    return { error: ar.talent.errors.server };
  }
  const result = data as unknown as { ok: boolean; error?: string };
  if (!result?.ok) {
    return { error: ar.talent.errors.server };
  }

  revalidatePath(`/t/${token}`);
  redirect(`/talent/manage/${token}?published=1`);
}

export async function setVisibility(token: string, visible: boolean) {
  const supabase = createPublicClient();
  const { error } = await supabase.rpc("talent_set_visibility", {
    p_token: token,
    p_visible: visible,
  });
  if (error) console.error("talent visibility failed:", error.message);
  revalidatePath(`/t/${token}`);
  revalidatePath(`/talent/manage/${token}`);
}

export async function deleteProfile(token: string) {
  const supabase = createPublicClient();
  // Immediate and total. A person withdrawing a published CV is exercising a
  // right, not filing a request — so no soft delete and no grace period.
  const { error } = await supabase.rpc("talent_delete_profile", {
    p_token: token,
  });
  if (error) {
    console.error("talent delete failed:", error.message);
    return;
  }
  redirect("/talent?deleted=1");
}
