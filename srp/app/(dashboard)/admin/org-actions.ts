"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS } from "@/lib/org-cookie";

// Switching workspaces writes a preference, not a permission. The cookie is
// re-checked against memberships on every request (lib/auth.ts), so the worst
// an invalid value can do is leave you where you already were — but there is
// no reason to store one, so it is validated here too.
export async function switchOrganization(formData: FormData): Promise<void> {
  const session = await requireMembership();
  const target = String(formData.get("org_id") ?? "");

  if (!session.memberships.some((membership) => membership.orgId === target)) {
    redirect("/admin");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, target, ACTIVE_ORG_COOKIE_OPTIONS);

  // Back to the dashboard rather than the current page: the page you were on
  // may not exist in the organization you just moved to.
  redirect("/admin");
}
