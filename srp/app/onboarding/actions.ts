"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS } from "@/lib/org-cookie";
import { ar } from "@/lib/i18n/ar";

export type OnboardingState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

// Mirrors the CHECK constraint on organizations.slug (0006). Kept in sync by
// hand rather than shared, because the database is the authority and this is
// only here to fail fast with a readable message.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE),
  full_name: z.string().trim().min(2).max(120),
});

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  await requireUser();

  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    full_name: formData.get("full_name"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key === "slug") fieldErrors.slug = ar.onboarding.errors.slugFormat;
      else if (key === "name") fieldErrors.name = ar.onboarding.errors.name;
      else if (key === "full_name")
        fieldErrors.full_name = ar.onboarding.errors.fullName;
    }
    return { error: ar.onboarding.errors.invalid, fieldErrors };
  }

  const supabase = await createClient();
  // create_organization is security definer and does all the authorization
  // itself: it refuses a caller who already belongs somewhere, and the slug
  // CHECK constraints stay the authority on format and reserved words.
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_full_name: parsed.data.full_name,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("slug taken")) {
      return {
        error: ar.onboarding.errors.slugTaken,
        fieldErrors: { slug: ar.onboarding.errors.slugTaken },
      };
    }
    if (message.includes("invalid slug")) {
      return {
        error: ar.onboarding.errors.slugFormat,
        fieldErrors: { slug: ar.onboarding.errors.slugFormat },
      };
    }
    if (message.includes("already a member")) {
      // Nothing to do here; their workspace exists.
      redirect("/admin");
    }
    console.error("create_organization failed:", error.message);
    return { error: ar.onboarding.errors.serverError, fieldErrors: {} };
  }

  if (typeof orgId === "string") {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTIONS);
  }

  redirect("/admin");
}
