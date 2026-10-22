import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationTimeline } from "@/components/seeker/portal/application-timeline";
import { ApplicationStatusBadge } from "@/components/seeker/portal/badges";
import { requireSeeker } from "@/lib/seeker";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { getMyApplications } from "../data";

export const metadata: Metadata = {
  title: ar.seekerPortal.applications.title,
};

const PAGE_SIZE = 10;

// For account holders this replaces tracking by reference code (plan §2.4);
// the code is still shown, because emails and a guest's habits refer to it.
// Statuses and timestamps only — never a score, a note or a reason (FR-08).
export default async function SeekerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSeeker({ next: "/me/applications" });
  const sp = await searchParams;
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const { rows, total, ok } = await getMyApplications(page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const t = ar.seekerPortal.applications;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      {!ok ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{ar.errors.unavailableTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar.errors.serverBody}
          </p>
        </div>
      ) : rows.length === 0 && page === 1 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
            <Briefcase className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-base font-semibold">{t.emptyTitle}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t.emptyBody}</p>
          <Button
            size="sm"
            className="mt-2"
            nativeButton={false}
            render={<Link href="/me/jobs" />}
          >
            {ar.seekerPortal.home.browseJobs}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {rows.map((application) => (
              <li
                key={application.id}
                className="grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
              >
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h2 className="text-base font-semibold">
                        {application.job_title}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {application.org_name}
                      </span>
                    </div>
                    <ApplicationStatusBadge status={application.status} />
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">{t.appliedAt}</dt>
                      <dd className="tabular-nums">
                        {formatDate(application.created_at)}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">{t.refCode}</dt>
                      <dd>
                        <code
                          dir="ltr"
                          className="select-all rounded-sm bg-surface-soft px-1.5 py-0.5 font-mono text-xs"
                        >
                          {application.ref_code}
                        </code>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex flex-col gap-2 border-t pt-4 md:border-s md:border-t-0 md:ps-5 md:pt-0">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t.timeline}
                  </h3>
                  <ApplicationTimeline history={application.history} />
                </div>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav
              aria-label={t.title}
              className="flex items-center justify-between gap-3 border-t pt-4 text-sm"
            >
              {page > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/me/applications?page=${page - 1}`} />}
                >
                  <ChevronRight aria-hidden />
                  {ar.seekerPortal.previous}
                </Button>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground tabular-nums">
                {ar.seekerPortal.pageOf
                  .replace("{page}", String(Math.min(page, pages)))
                  .replace("{pages}", String(pages))}
              </span>
              {page < pages ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/me/applications?page=${page + 1}`} />}
                >
                  {ar.seekerPortal.next}
                  <ChevronLeft aria-hidden />
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      )}

      <p className="max-w-[68ch] text-sm text-muted-foreground">
        {t.guestNote}{" "}
        <Link href="/track" className="text-primary underline-offset-4 hover:underline">
          {t.guestNoteLink}
        </Link>
      </p>
    </>
  );
}
