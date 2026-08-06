import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { MemberRole } from "@/types/database";

// The tenancy gate (CLAUDE.md D11/D12). A session on its own means nothing
// here: what authorizes a dashboard request is a MEMBERSHIP in a specific
// organization. Every /admin page resolves one through requireMembership()
// and then scopes its own queries by the org id it returns — RLS is the
// second layer, never the only one.

export type Session = {
  userId: string;
  fullName: string;
  org: {
    id: string;
    slug: string;
    name: string;
    status: string;
    retentionMonths: number;
  };
  role: MemberRole;
  /** Every org this user belongs to, for the switcher (S2). */
  memberships: { orgId: string; slug: string; name: string; role: MemberRole }[];
};

// Roles allowed to change anything inside an organization; `viewer` reads.
export const WRITE_ROLES: MemberRole[] = ["owner", "admin", "hr"];
// Roles allowed to change org settings and the team.
export const ADMIN_ROLES: MemberRole[] = ["owner", "admin"];

export function canWrite(role: MemberRole) {
  return WRITE_ROLES.includes(role);
}

export function canAdminister(role: MemberRole) {
  return ADMIN_ROLES.includes(role);
}

// Memoized per request so a layout and its pages each call it without extra
// round trips.
export const getSession = cache(async (): Promise<Session | null> => {
  // Supabase not configured yet (scaffold state): nobody is authenticated,
  // so every /admin route redirects to /login.
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle(),
    // RLS already restricts this to the caller's own rows; the join brings
    // the organization back in the same trip.
    supabase
      .from("memberships")
      .select(
        "role, org_id, organizations(id, slug, name, status, retention_months, deleted_at)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  type MembershipRow = {
    role: MemberRole;
    org_id: string;
    organizations: {
      id: string;
      slug: string;
      name: string;
      status: string;
      retention_months: number;
      deleted_at: string | null;
    } | null;
  };

  const rows = (
    (membershipRes.data ?? []) as unknown as MembershipRow[]
  ).filter((row) => row.organizations !== null && row.organizations.deleted_at === null);
  if (rows.length === 0) return null;

  // Active-org selection arrives with the switcher in S2. Until then the
  // earliest membership is the workspace — which, for every account that
  // exists today, is the only organization they have.
  const active = rows[0]!;
  const org = active.organizations!;

  return {
    userId: profile.id,
    fullName: profile.full_name,
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status,
      retentionMonths: org.retention_months,
    },
    role: active.role,
    memberships: rows.map((row) => ({
      orgId: row.org_id,
      slug: row.organizations!.slug,
      name: row.organizations!.name,
      role: row.role,
    })),
  };
});

// Every /admin page and layout must go through this gate. A session with no
// membership has no workspace to show, so it is treated exactly like being
// signed out.
export async function requireMembership(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// For pages only owners/admins may open (org settings, team).
export async function requireOrgAdmin(): Promise<Session> {
  const session = await requireMembership();
  if (!canAdminister(session.role)) redirect("/admin");
  return session;
}
