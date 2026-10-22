import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandingForm } from "@/components/admin/branding-form";
import { PageTabs } from "@/components/admin/page-tabs";
import {
  AddMemberForm,
  CompanySettingsForm,
  ComplianceForm,
  InviteMemberForm,
  MemberRoleBadge,
  MemberRoleForm,
  RevokeInvitationButton,
} from "@/components/admin/settings-forms";
import { requireOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import { formatDate } from "@/lib/format";
import type { MemberRole } from "@/types/database";

const TABS = ["company", "team", "compliance", "retention"] as const;

export const metadata: Metadata = {
  title: ar.settingsPage.title,
};

// Owner/admin only per the RLS matrix (§4.1); requireOrgAdmin redirects
// anyone else back to the dashboard.
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireOrgAdmin();
  const sp = await searchParams;
  const initialTab = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : "company";

  const supabase = await createClient();
  // The team roster is memberships plus identity — profiles no longer
  // carries a role (D14). The names are a second read: memberships.user_id
  // and profiles.id both reference auth.users, with no foreign key between
  // them, so PostgREST cannot embed one in the other. The embed this used to
  // be failed on every request and left the team list empty.
  // All three need nothing but session.org.id, so they go out together. The
  // branding read used to await after the other two and added a round trip
  // to the page for no reason.
  const [membersRes, invitesRes, orgRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, created_at")
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("org_id", session.org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Branding fields are not on the session (it carries only what the gate
    // needs), so they are read here.
    supabase
      .from("organizations")
      .select(
        "name, slug, about, website, industry, city, brand_color, listed_publicly, logo_path, cover_path, blind_screening, nitaqat_band, saudization_target"
      )
      .eq("id", session.org.id)
      .maybeSingle(),
  ]);
  const org = orgRes.data;

  const publicUrl = (path: string | null) =>
    path
      ? supabase.storage.from("org-assets").getPublicUrl(path).data.publicUrl
      : null;

  const memberRows = membersRes.data ?? [];
  if (membersRes.error)
    console.error("members query failed:", membersRes.error.message);
  if (invitesRes.error)
    console.error("invitations query failed:", invitesRes.error.message);
  const invitations = invitesRes.data ?? [];

  // Ids come from this org's own memberships, which the query above already
  // scoped by org_id and RLS; profiles RLS adds its co-member check on top.
  const memberIds = memberRows.map((row) => row.user_id);
  const profilesRes =
    memberIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [], error: null };
  if (profilesRes.error)
    console.error("member profiles query failed:", profilesRes.error.message);
  const names = new Map(
    (profilesRes.data ?? []).map((profile) => [profile.id, profile.full_name])
  );

  type MemberRow = {
    user_id: string;
    role: MemberRole;
    profiles: { id: string; full_name: string } | null;
  };
  const members: MemberRow[] = memberRows.flatMap((row) => {
    const fullName = names.get(row.user_id);
    return fullName === undefined
      ? []
      : [{ user_id: row.user_id, role: row.role, profiles: { id: row.user_id, full_name: fullName } }];
  });
  const t = ar.settingsPage;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <Link
          href="/admin/billing"
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <CreditCard className="size-4" aria-hidden />
          {t.billingLink}
        </Link>
      </div>

      <PageTabs
        initial={initialTab}
        tabs={[
          {
            value: "company",
            label: t.tabs.company,
            content: (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{ar.branding.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {ar.branding.subtitle}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <BrandingForm
                      rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null}
                      values={{
                        name: org?.name ?? session.org.name,
                        slug: org?.slug ?? session.org.slug,
                        about: org?.about ?? "",
                        website: org?.website ?? "",
                        industry: org?.industry ?? "",
                        city: org?.city ?? "",
                        brandColor: org?.brand_color ?? "",
                        listedPublicly: org?.listed_publicly ?? true,
                        logoUrl: publicUrl(org?.logo_path ?? null),
                        coverUrl: publicUrl(org?.cover_path ?? null),
                      }}
                    />
                  </CardContent>
                </Card>
              </>
            ),
          },
          {
            value: "team",
            label: t.tabs.team,
            content: (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t.teamTitle}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t.teamHint}</p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.member}</TableHead>
                          <TableHead>{t.role}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.user_id}>
                            <TableCell className="font-medium">
                              {member.profiles!.full_name}{" "}
                              {member.user_id === session.userId && (
                                <span className="text-xs text-muted-foreground">
                                  {t.you}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {member.user_id === session.userId ? (
                                <MemberRoleBadge role={member.role} />
                              ) : (
                                <MemberRoleForm
                                  memberId={member.user_id}
                                  currentRole={member.role}
                                  canAssignOwner={session.role === "owner"}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {invitations.length > 0 && (
                      <div className="mt-6 border-t pt-6">
                        <h3 className="mb-3 font-semibold">{t.invite.pendingTitle}</h3>
                        <ul className="flex flex-col gap-2">
                          {invitations.map((invitation) => (
                            <li
                              key={invitation.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
                            >
                              <span dir="ltr" className="font-medium">
                                {invitation.email}
                              </span>
                              <span className="text-muted-foreground">
                                {ar.admin.roles[invitation.role]}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t.invite.expiresAt} {formatDate(invitation.expires_at)}
                              </span>
                              <span className="ms-auto">
                                <RevokeInvitationButton id={invitation.id} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-6 border-t pt-6">
                      <InviteMemberForm canAssignOwner={session.role === "owner"} />
                    </div>

                    <details className="mt-6 border-t pt-6">
                      <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
                        {t.invite.manualTitle}
                      </summary>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t.invite.manualHint}
                      </p>
                      <div className="mt-4">
                        <AddMemberForm />
                      </div>
                    </details>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t.rolesTitle}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                      {(["owner", "admin", "hr", "viewer"] as const).map((role) => (
                        <div key={role} className="contents">
                          <dt className="font-medium">{ar.admin.roles[role]}</dt>
                          <dd className="text-muted-foreground">{t.roleHelp[role]}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              </>
            ),
          },
          {
            value: "compliance",
            label: t.tabs.compliance,
            content: (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{ar.blindScreening.title} · {ar.saudization.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComplianceForm
                      blindScreening={org?.blind_screening ?? false}
                      nitaqatBand={org?.nitaqat_band ?? null}
                      saudizationTarget={org?.saudization_target ?? null}
                    />
                  </CardContent>
                </Card>
              </>
            ),
          },
          {
            value: "retention",
            label: t.tabs.retention,
            content: (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t.companyTitle}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompanySettingsForm
                      retentionMonths={session.org.retentionMonths}
                    />
                  </CardContent>
                </Card>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
