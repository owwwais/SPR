import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChartColumn, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.admin.dashboard,
};

export default async function AdminDashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [applications, publishedJobs, awaiting] = await Promise.all([
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("analysis_status", ["pending", "processing"]),
  ]);

  const tiles = [
    {
      label: ar.stats.totalApplications,
      value: applications.count ?? 0,
      icon: FileText,
    },
    {
      label: ar.stats.publishedJobs,
      value: publishedJobs.count ?? 0,
      icon: Briefcase,
    },
    {
      label: ar.stats.awaitingAnalysis,
      value: awaiting.count ?? 0,
      icon: Loader2,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{ar.admin.dashboard}</h1>
        <p className="mt-1 text-muted-foreground">
          {ar.admin.welcome}، {profile.full_name}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {tile.label}
                </span>
                <span className="text-3xl font-bold tabular-nums">
                  {tile.value}
                </span>
              </div>
              <tile.icon
                className="size-8 text-muted-foreground/40"
                aria-hidden
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/admin/jobs" />}>
          <Briefcase className="size-4" aria-hidden />
          {ar.admin.jobs}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/stats" />}
        >
          <ChartColumn className="size-4" aria-hidden />
          {ar.admin.stats}
        </Button>
      </div>
    </div>
  );
}
