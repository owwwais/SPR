import Link from "next/link";
import { Building2, CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ar } from "@/lib/i18n/ar";
import { formatDate } from "@/lib/format";
import type { JobType } from "@/types/database";

export type PublicJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  type: JobType;
  closes_at: string | null;
  created_at: string;
};

export function JobCard({ job }: { job: PublicJob }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold group-hover:text-primary">
          {job.title}
        </h3>
        <Badge variant="secondary" className="shrink-0">
          {ar.jobs.typeLabels[job.type]}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {job.department && (
          <span className="flex items-center gap-1">
            <Building2 className="size-3.5" aria-hidden />
            {job.department}
          </span>
        )}
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {job.location}
          </span>
        )}
        {job.closes_at && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {ar.jobs.closesAt}: {formatDate(job.closes_at)}
          </span>
        )}
      </div>
    </Link>
  );
}
