import { Briefcase, ChartColumn, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { NavLink } from "@/components/admin/nav-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireProfile();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b bg-background p-4 md:min-h-full md:w-60 md:border-b-0 md:border-e">
        <div className="flex items-center gap-2 px-3 font-semibold">
          <Briefcase className="size-5 text-primary" aria-hidden />
          <span>{ar.common.appName}</span>
        </div>
        <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          <NavLink href="/admin" exact>
            <LayoutDashboard className="size-4" aria-hidden />
            {ar.admin.dashboard}
          </NavLink>
          <NavLink href="/admin/jobs">
            <Briefcase className="size-4" aria-hidden />
            {ar.admin.jobs}
          </NavLink>
          <NavLink href="/admin/stats">
            <ChartColumn className="size-4" aria-hidden />
            {ar.admin.stats}
          </NavLink>
          {profile.role === "admin" && (
            <NavLink href="/admin/settings">
              <Settings className="size-4" aria-hidden />
              {ar.admin.settings}
            </NavLink>
          )}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {profile.full_name}
            </span>
            <Badge variant="secondary" className="w-fit">
              {ar.admin.roles[profile.role]}
            </Badge>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              title={ar.admin.logout}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">{ar.admin.logout}</span>
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
