import Link from "next/link";
import { Building2, CalendarClock, CircleCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicJob } from "@/components/jobs/job-card";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";

export type SeekerJob = PublicJob & {
  company: { name: string; slug: string };
  /** closes_at is in the past — computed on the server, once. */
  closed: boolean;
  /** This seeker already applied with their account. */
  applied: boolean;
};

// The public JobCard is one big link to the job page, so it cannot hold a
// second action. A seeker needs two — read the details, or apply with the
// stored profile — side by side, so this card keeps the same facts and
// gives each action its own control.
export function SeekerJobCard({ job }: { job: SeekerJob }) {
  const t = ar.seekerPortal;
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm text-muted-foreground">
            {job.company.name}
          </span>
          <h3 className="text-base font-semibold text-foreground">
            {job.title}
          </h3>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {ar.jobs.typeLabels[job.type]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {job.department && (
          <span className="flex items-center gap-1">
            <Building2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            {job.department}
          </span>
        )}
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden />
            {job.location}
          </span>
        )}
        {job.closes_at && (
          <span className="flex items-center gap-1 tabular-nums">
            <CalendarClock className="size-3.5" strokeWidth={1.75} aria-hidden />
            {ar.jobs.closesAt}: {formatDate(job.closes_at)}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
        {job.applied ? (
          <Badge
            variant="success"
            render={<Link href="/me/applications" />}
          >
            <CircleCheck aria-hidden />
            {t.alreadyApplied}
          </Badge>
        ) : job.closed ? (
          <span className="text-sm text-muted-foreground">
            {ar.jobs.closedForApplications}
          </span>
        ) : (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/me/apply/${job.id}`} />}
          >
            {t.applyWithProfile}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/jobs/${job.id}`} />}
        >
          {t.details}
        </Button>
      </div>
    </article>
  );
}
