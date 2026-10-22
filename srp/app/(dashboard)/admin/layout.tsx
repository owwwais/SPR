import Link from "next/link";
import { Plus } from "lucide-react";
import { canWrite, isPlatformAdmin, requireMembership } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing";
import { getHats } from "@/lib/seeker";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { MobileNavDrawer, MobileNavTrigger, MobileTabBar } from "@/components/admin/mobile-nav";
import { Sidebar, type SidebarJob } from "@/components/admin/sidebar";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

// Up to five published jobs sit under "الوظائف" with their unreviewed count,
// so the most common next step — "who applied?" — is one click from anywhere.
async function sidebarJobs(orgId: string): Promise<SidebarJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, applications(count)")
    .eq("org_id", orgId)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("applications.org_id", orgId)
    .eq("applications.status", "new")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error("sidebar jobs failed:", error.code, error.message);
    return [];
  }
  type Row = { id: string; title: string; applications: { count: number }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    newApplicants: row.applications?.[0]?.count ?? 0,
  }));
}

export default async function AdminLayout({
  children,
  panel,
}: Readonly<{
  children: React.ReactNode;
  /** The applicant side panel (@panel); null unless one was intercepted. */
  panel: React.ReactNode;
}>) {
  const session = await requireMembership();
  // getHats(): the switcher to the seeker hat (D26), a routing hint only —
  // /me runs its own gate. getBillingOverview() is null before 0025.
  const [hats, platformAdmin, billing, jobs] = await Promise.all([
    getHats(),
    isPlatformAdmin(),
    getBillingOverview(session.org.id),
    sidebarJobs(session.org.id),
  ]);

  const sidebar = (
    <Sidebar
      session={session}
      jobs={jobs}
      billing={billing}
      seeker={hats.seeker}
      platformAdmin={platformAdmin}
    />
  );

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 overflow-y-auto border-e bg-sidebar md:block">
        {sidebar}
      </aside>
      <MobileNavDrawer>{sidebar}</MobileNavDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-6">
          <MobileNavTrigger />
          <Breadcrumbs orgName={session.org.name} />
          {canWrite(session.role) && (
            <Button
              size="sm"
              className="ms-auto"
              nativeButton={false}
              render={<Link href="/admin/jobs/new" />}
            >
              <Plus className="size-4" aria-hidden />
              {ar.shell.newJob}
            </Button>
          )}
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 pt-5 pb-24 sm:px-6 sm:pt-6 md:pb-8">
          {children}
        </main>
      </div>
      <MobileTabBar />
      {panel}
    </div>
  );
}
