import Link from "next/link";
import {
  Briefcase,
  CalendarDays,
  ChartColumn,
  CreditCard,
  ExternalLink,
  House,
  LogOut,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { NavLink } from "@/components/admin/nav-link";
import { OrgSwitcher } from "@/components/admin/org-switcher";
import { UsageMeter } from "@/components/admin/usage-meter";
import { Button } from "@/components/ui/button";
import { canAdminister, type Session } from "@/lib/auth";
import type { BillingOverview } from "@/lib/billing";
import { ar } from "@/lib/i18n/ar";

export type SidebarJob = { id: string; title: string; newApplicants: number };

// DESIGN.md §8: 20px icons in navigation, stroke 1.75.
const icon = "size-5 shrink-0";
const stroke = 1.75;

// Everything the workspace offers, in the order work happens (P4b, UI-A1).
// Rendered twice by the layout: in the desktop aside and in the phone drawer.
export function Sidebar({
  session,
  jobs,
  billing,
  seeker,
  platformAdmin,
  banksToReview,
}: {
  session: Session;
  jobs: SidebarJob[];
  /** Question banks waiting for the mandatory HR review (D30). */
  banksToReview: number;
  billing: BillingOverview | null;
  seeker: boolean;
  platformAdmin: boolean;
}) {
  const t = ar.shell;
  const admin = canAdminister(session.role);

  return (
    <div className="flex min-h-full flex-col gap-5 p-3 pt-2">
      <div className="flex h-11 items-center pe-12 md:pe-0">
        <div className="min-w-0 flex-1">
          <OrgSwitcher
            current={{ id: session.org.id, name: session.org.name }}
            memberships={session.memberships}
          />
        </div>
      </div>

      <nav aria-label={t.primaryNav} className="flex flex-col gap-0.5">
        <NavLink href="/admin" exact>
          <House className={icon} strokeWidth={stroke} aria-hidden />
          {t.today}
        </NavLink>
        <NavLink href="/admin/jobs">
          <Briefcase className={icon} strokeWidth={stroke} aria-hidden />
          {ar.admin.jobs}
        </NavLink>
        {jobs.length > 0 && (
          <ul aria-label={t.activeJobs} className="flex flex-col gap-0.5">
            {jobs.map((job) => (
              <li key={job.id}>
                <NavLink
                  href={`/admin/jobs/${job.id}/applicants`}
                  nested
                  badge={job.newApplicants}
                  badgeLabel={t.newApplicants}
                >
                  <span className="truncate">{job.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        <NavLink href="/admin/candidates">
          <Users className={icon} strokeWidth={stroke} aria-hidden />
          {ar.candidates.title}
        </NavLink>
        <NavLink href="/admin/interviews" badge={banksToReview} badgeLabel={ar.today.banks.title}>
          <MessagesSquare className={icon} strokeWidth={stroke} aria-hidden />
          {ar.interviewsHub.title}
        </NavLink>
        <NavLink href="/admin/calendar">
          <CalendarDays className={icon} strokeWidth={stroke} aria-hidden />
          {ar.calendar.title}
        </NavLink>
        <NavLink href="/admin/stats">
          <ChartColumn className={icon} strokeWidth={stroke} aria-hidden />
          {ar.admin.stats}
        </NavLink>
      </nav>

      <nav aria-labelledby="sidebar-org" className="flex flex-col gap-0.5">
        <span id="sidebar-org" className="px-3 pb-1 text-xs font-medium text-muted-foreground">
          {t.orgSection}
        </span>
        <a
          href={`/c/${session.org.slug}`}
          target="_blank"
          rel="noopener"
          className="flex min-h-9 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-body transition-colors duration-150 hover:bg-surface-sunken/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
        >
          <ExternalLink className={icon} strokeWidth={stroke} aria-hidden />
          {t.careersPage}
          <span className="sr-only">{t.opensInNewTab}</span>
        </a>
        <NavLink href="/admin/billing">
          <CreditCard className={icon} strokeWidth={stroke} aria-hidden />
          {t.billing}
        </NavLink>
        {admin && (
          <NavLink href="/admin/settings">
            <Settings className={icon} strokeWidth={stroke} aria-hidden />
            {ar.admin.settings}
          </NavLink>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {billing && (
          <Link
            href="/admin/billing"
            className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-input focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
          >
            <span className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t.plan}</span>
              <span className="font-semibold">{billing.plan?.name_ar ?? "—"}</span>
            </span>
            <UsageMeter
              compact
              label={t.analysesThisMonth}
              used={billing.usage.analyses}
              limit={billing.limits.analyses}
            />
          </Link>
        )}

        {(seeker || platformAdmin) && (
          <div className="flex flex-col gap-0.5">
            {seeker && (
              <NavLink href="/me" exact>
                <UserRound className={icon} strokeWidth={stroke} aria-hidden />
                {ar.seekerPortal.admin.seekerAccountLink}
              </NavLink>
            )}
            {platformAdmin && (
              <NavLink href="/platform">
                <ShieldCheck className={icon} strokeWidth={stroke} aria-hidden />
                {t.platform}
              </NavLink>
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t pt-3">
          <Link
            href="/admin/account"
            title={ar.account.open}
            className="-m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-surface-soft focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground"
            >
              {session.fullName.trim().charAt(0)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{session.fullName}</span>
              <span className="text-xs text-muted-foreground">{ar.admin.roles[session.role]}</span>
            </span>
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon" title={ar.admin.logout}>
              <LogOut className="size-4" strokeWidth={stroke} aria-hidden />
              <span className="sr-only">{ar.admin.logout}</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
