import type { Metadata } from "next";
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
import {
  AddMemberForm,
  CompanySettingsForm,
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

export const metadata: Metadata = {
  title: ar.settingsPage.title,
};

// Owner/admin only per the RLS matrix (§4.1); requireOrgAdmin redirects
// anyone else back to the dashboard.
export default async function AdminSettingsPage() {
  const session = await requireOrgAdmin();

  const supabase = await createClient();
  // The team roster is memberships joined to identity — profiles no longer
  // carries a role (D14).
  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, created_at, profiles(id, full_name)")
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("org_id", session.org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);
  const memberRows = membersRes.data;
  if (membersRes.error)
    console.error("members query failed:", membersRes.error.message);
  if (invitesRes.error)
    console.error("invitations query failed:", invitesRes.error.message);
  const invitations = invitesRes.data ?? [];

  type MemberRow = {
    user_id: string;
    role: MemberRole;
    profiles: { id: string; full_name: string } | null;
  };
  const members = ((memberRows ?? []) as unknown as MemberRow[]).filter(
    (row) => row.profiles !== null
  );
  const t = ar.settingsPage;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t.companyTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanySettingsForm
            companyName={session.org.name}
            retentionMonths={session.org.retentionMonths}
          />
        </CardContent>
      </Card>

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
    </div>
  );
}
