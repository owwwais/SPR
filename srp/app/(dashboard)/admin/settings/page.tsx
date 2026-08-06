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
  MemberRoleBadge,
  MemberRoleForm,
} from "@/components/admin/settings-forms";
import { requireOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
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
  const { data: memberRows, error: membersError } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profiles(id, full_name)")
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: true });
  if (membersError)
    console.error("members query failed:", membersError.message);

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
          <div className="mt-6 border-t pt-6">
            <AddMemberForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
