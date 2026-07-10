import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";
import { formatDate, todayISO } from "@/lib/format";

export const revalidate = 60; // FR-02: ISR

// No paths at build time; details are generated on first request and then
// cached for `revalidate` seconds (on-demand ISR).
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getJob = cache(async (id: string) => {
  if (!UUID_RE.test(id)) return null;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id,title,department,location,type,description,requirements,skills,min_years_experience,closes_at,created_at"
      )
      .eq("id", id)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("job detail query failed:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("job detail unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);
  return { title: job?.title ?? ar.nav.jobs };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const applicationsClosed =
    job.closes_at !== null && job.closes_at < todayISO();

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div>
        <Link
          href="/jobs"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {ar.jobs.backToJobs}
        </Link>
        <h1 className="text-3xl font-bold">{job.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{ar.jobs.typeLabels[job.type]}</Badge>
          {job.department && (
            <span className="flex items-center gap-1">
              <Building2 className="size-4" aria-hidden />
              {job.department}
            </span>
          )}
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              {job.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="size-4" aria-hidden />
            {ar.jobs.postedAt}: {formatDate(job.created_at)}
          </span>
          {job.closes_at && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-4" aria-hidden />
              {ar.jobs.closesAt}: {formatDate(job.closes_at)}
            </span>
          )}
          {(job.min_years_experience ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="size-4" aria-hidden />
              {ar.jobs.minYears}: {job.min_years_experience} {ar.jobs.yearsUnit}
            </span>
          )}
        </div>
      </div>

      {applicationsClosed ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          {ar.jobs.closedForApplications}
        </div>
      ) : (
        <div>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href={`/jobs/${job.id}/apply`} />}
          >
            {ar.jobs.applyNow}
          </Button>
        </div>
      )}

      {job.skills.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{ar.jobs.skillsTitle}</h2>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{ar.jobs.descriptionTitle}</h2>
        <Markdown text={job.description} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{ar.jobs.requirementsTitle}</h2>
        <Markdown text={job.requirements} />
      </section>

      {!applicationsClosed && (
        <div className="border-t pt-6">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href={`/jobs/${job.id}/apply`} />}
          >
            {ar.jobs.applyNow}
          </Button>
        </div>
      )}
    </article>
  );
}
