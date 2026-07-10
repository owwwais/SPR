import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.admin.settings,
};

// Placeholder — settings (retention, HR users) are built in M7.
// Admin-only per the RLS matrix (§4.1).
export default async function AdminSettingsPage() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/admin");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.admin.settings}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{ar.common.comingSoonTitle}</CardTitle>
          <CardDescription>{ar.common.comingSoonBody}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
