import type { Metadata } from "next";
import { SeekerJobsExplorer } from "@/components/seeker/portal/seeker-jobs-explorer";
import { requireSeeker } from "@/lib/seeker";
import { ar } from "@/lib/i18n/ar";
import { getSeekerJobs } from "../data";

export const metadata: Metadata = {
  title: ar.seekerPortal.jobs.title,
};

export default async function SeekerJobsPage() {
  await requireSeeker({ next: "/me/jobs" });
  const jobs = await getSeekerJobs();
  const t = ar.seekerPortal.jobs;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* null is a failed lookup, not an empty market: saying "no jobs" when
          the query broke would be false. */}
      {jobs === null ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{ar.errors.unavailableTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar.errors.unavailableBody}
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{ar.marketplace.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar.marketplace.emptyBody}
          </p>
        </div>
      ) : (
        <SeekerJobsExplorer jobs={jobs} />
      )}
    </>
  );
}
