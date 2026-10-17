import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  ExternalLink,
  FileText,
  Phone,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AnalysisRefresher } from "@/components/seeker/portal/analysis-refresher";
import {
  AnalysisBadge,
  ApplicationStatusBadge,
} from "@/components/seeker/portal/badges";
import { SeekerJobCard } from "@/components/seeker/portal/seeker-job-card";
import { requireSeeker } from "@/lib/seeker";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { getMyApplications, getSeekerJobs } from "./data";

export const metadata: Metadata = {
  title: ar.seekerPortal.nav.home,
};

// The seeker's home: where the profile stands, the latest applications, and
// the newest jobs to apply to. Deliberately no recommendations and no "fits
// you" badges yet — those arrive explainable, with P2 (D28) — and no
// interview tasks until the interview room exists (I2).
export default async function SeekerHomePage() {
  const { profile } = await requireSeeker();
  const [applications, jobs] = await Promise.all([
    getMyApplications(1, 3),
    getSeekerJobs(),
  ]);
  const t = ar.seekerPortal.home;
  const analysisRunning =
    profile.analysis_status === "pending" ||
    profile.analysis_status === "processing";
  const published = profile.status === "published";
  const newest = (jobs ?? []).slice(0, 6);

  return (
    <>
      <AnalysisRefresher active={analysisRunning} />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {profile.full_name
            ? t.greeting.replace("{name}", profile.full_name)
            : t.greetingFallback}
        </h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      {!profile.phone && (
        <Alert variant="warning">
          <Phone aria-hidden />
          <AlertTitle>{t.completePhoneTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t.completePhoneBody}
            <Link
              href="/me/profile"
              className="font-medium text-warning underline underline-offset-4"
            >
              {t.completePhoneAction}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* ------------------------------ profile ------------------------------ */}
        <section
          aria-labelledby="profile-title"
          className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="profile-title" className="text-base font-semibold">
              {t.profileTitle}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/me/profile" />}
            >
              {t.editProfile}
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {profile.full_name ?? profile.email}
            </span>
            {profile.headline && (
              <span className="text-sm text-muted-foreground">
                {profile.headline}
              </span>
            )}
          </div>
          <dl className="flex flex-col gap-3 border-t pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {ar.seekerPortal.analysis.label}
              </dt>
              <dd>
                <AnalysisBadge status={profile.analysis_status} />
              </dd>
            </div>
            {profile.cv_versions[0] && (
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="size-4" strokeWidth={1.75} aria-hidden />
                  {ar.seekerPortal.profile.cvTitle}
                </dt>
                <dd className="tabular-nums">
                  {formatDate(profile.cv_versions[0].created_at)}
                </dd>
              </div>
            )}
          </dl>
          {published && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2.5 text-sm text-primary-soft-foreground">
              <span>{t.publicPage}</span>
              <Link
                href={`/t/${profile.public_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline"
              >
                {t.openPublicPage}
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </section>

        {/* --------------------------- applications --------------------------- */}
        <section
          aria-labelledby="applications-title"
          className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="applications-title" className="text-base font-semibold">
              {t.latestApplicationsTitle}
            </h2>
            {applications.total > 0 && (
              <Link
                href="/me/applications"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                {ar.seekerPortal.viewAll}
                <ArrowLeft className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
          {!applications.ok ? (
            <p className="text-sm text-muted-foreground">
              {ar.errors.unavailableTitle}
            </p>
          ) : applications.rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-2">
              <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
                <Briefcase className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              </span>
              <p className="font-medium">{t.noApplicationsTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.noApplicationsBody}
              </p>
              <Button
                size="sm"
                className="mt-1"
                nativeButton={false}
                render={<Link href="/me/jobs" />}
              >
                {t.browseJobs}
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y">
              {applications.rows.map((application) => (
                <li
                  key={application.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {application.job_title}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {application.org_name} ·{" "}
                      <span className="tabular-nums">
                        {formatDate(application.created_at)}
                      </span>
                    </span>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ------------------------------ newest jobs ------------------------------ */}
      <section aria-labelledby="jobs-title" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="jobs-title" className="text-lg font-semibold">
            {t.newestJobsTitle}
          </h2>
          {newest.length > 0 && (
            <Link
              href="/me/jobs"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              {ar.seekerPortal.viewAll}
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        {jobs === null ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">{ar.errors.unavailableTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ar.errors.unavailableBody}
            </p>
          </div>
        ) : newest.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
              <Briefcase className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="font-medium">{t.noJobsTitle}</p>
            <p className="text-sm text-muted-foreground">{t.noJobsBody}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newest.map((job) => (
              <SeekerJobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
