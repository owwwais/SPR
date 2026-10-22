"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ar } from "@/lib/i18n/ar";

type Crumb = { label: string; href?: string };

const SECTIONS: Record<string, string> = {
  jobs: ar.admin.jobs,
  candidates: ar.candidates.title,
  calendar: ar.calendar.title,
  stats: ar.admin.stats,
  settings: ar.admin.settings,
  billing: ar.shell.billing,
};

// Derived from the URL alone, so it needs no data and cannot disagree with
// the page: a record's own name stays in that page's heading.
function crumbsFor(pathname: string): Crumb[] {
  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const c = ar.shell.crumbs;
  if (parts.length === 0) return [{ label: ar.shell.today }];

  const [section, id, sub, leaf] = parts;
  if (section === "applications") {
    return [{ label: ar.admin.jobs, href: "/admin/jobs" }, { label: c.application }];
  }
  const root: Crumb = { label: SECTIONS[section] ?? section, href: `/admin/${section}` };
  if (section !== "jobs" || !id) return [{ label: root.label }];
  if (id === "new") return [root, { label: c.newJob }];
  if (sub === "edit") return [root, { label: c.edit }];
  if (sub === "interview-bank") return [root, { label: c.interviewBank }];
  if (sub === "applicants" && leaf === "compare") {
    return [root, { label: c.applicants, href: `/admin/jobs/${id}/applicants` }, { label: c.compare }];
  }
  if (sub === "applicants") return [root, { label: c.applicants }];
  return [root];
}

export function Breadcrumbs({ orgName }: { orgName: string }) {
  const crumbs = crumbsFor(usePathname());

  return (
    <nav aria-label={ar.shell.breadcrumb} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="hidden max-w-48 truncate text-muted-foreground lg:block">{orgName}</li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li
                aria-hidden
                className={index === 0 ? "hidden text-muted-soft lg:block" : "text-muted-soft"}
              >
                <ChevronLeft className="size-3.5" strokeWidth={1.75} />
              </li>
              <li className="min-w-0 truncate">
                {last || !crumb.href ? (
                  <span aria-current={last ? "page" : undefined} className="font-medium">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
