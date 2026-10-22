import {
  Briefcase,
  CalendarDays,
  ChartColumn,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { canAdminister, requireMembership } from "@/lib/auth";
import { getHats } from "@/lib/seeker";
import { signOut } from "@/app/login/actions";
import { NavLink } from "@/components/admin/nav-link";
import { OrgSwitcher } from "@/components/admin/org-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireMembership();
  // The switcher to the seeker hat (D26): shown when this account also has
  // a seeker profile. A routing hint only — /me runs its own gate.
  const hats = await getHats();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b bg-sidebar p-4 md:sticky md:top-0 md:h-dvh md:w-62 md:overflow-y-auto md:shrink-0 md:border-b-0 md:border-e">
        <OrgSwitcher
          current={{ id: session.org.id, name: session.org.name }}
          memberships={session.memberships}
        />
        <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          <NavLink href="/admin" exact>
            <LayoutDashboard className="size-4" aria-hidden />
            {ar.admin.dashboard}
          </NavLink>
          <NavLink href="/admin/jobs">
            <Briefcase className="size-4" aria-hidden />
            {ar.admin.jobs}
          </NavLink>
          <NavLink href="/admin/calendar">
            <CalendarDays className="size-4" aria-hidden />
            {ar.calendar.title}
          </NavLink>
          <NavLink href="/admin/candidates">
            <Users className="size-4" aria-hidden />
            {ar.candidates.title}
          </NavLink>
          <NavLink href="/admin/stats">
            <ChartColumn className="size-4" aria-hidden />
            {ar.admin.stats}
          </NavLink>
          {canAdminister(session.role) && (
            <NavLink href="/admin/settings">
              <Settings className="size-4" aria-hidden />
              {ar.admin.settings}
            </NavLink>
          )}
          {hats.seeker && (
            <NavLink href="/me" exact>
              <UserRound className="size-4" aria-hidden />
              {ar.seekerPortal.admin.seekerAccountLink}
            </NavLink>
          )}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {session.fullName}
            </span>
            <Badge variant="secondary" className="w-fit">
              {ar.admin.roles[session.role]}
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
      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
