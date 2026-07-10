import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  CompanySettingsForm,
  MemberRoleBadge,
  MemberRoleForm,
} from "@/components/admin/settings-forms";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.settingsPage.title,
};

// Admin-only per the RLS matrix (§4.1).
export default async function AdminSettingsPage() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/admin");

  const supabase = await createClient();
  const [settingsRes, profilesRes] = await Promise.all([
    supabase
      .from("settings")
      .select("company_name, retention_months")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true }),
  ]);
  if (settingsRes.error)
    console.error("settings query failed:", settingsRes.error.message);
  if (profilesRes.error)
    console.error("profiles query failed:", profilesRes.error.message);

  const settings = settingsRes.data;
  const members = profilesRes.data ?? [];
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
            companyName={settings?.company_name ?? ""}
            retentionMonths={settings?.retention_months ?? 12}
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
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.full_name}{" "}
                    {member.id === profile.id && (
                      <span className="text-xs text-muted-foreground">
                        {t.you}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {member.id === profile.id ? (
                      <MemberRoleBadge role={member.role} />
                    ) : (
                      <MemberRoleForm
                        memberId={member.id}
                        currentRole={member.role}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
