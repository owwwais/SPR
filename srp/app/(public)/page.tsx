import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JobCard, type PublicJob } from "@/components/jobs/job-card";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";

export const revalidate = 60; // landing shows featured jobs (§3)

async function getFeaturedJobs(): Promise<PublicJob[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,department,location,type,closes_at,created_at")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) {
      console.error("featured jobs query failed:", error.message);
      return [];
    }
    return data;
  } catch (err) {
    console.warn("featured jobs unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function LandingPage() {
  const jobs = await getFeaturedJobs();

  return (
    <>
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {ar.landing.heroTitle}
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          {ar.landing.heroSubtitle}
        </p>
        <Button size="lg" nativeButton={false} render={<Link href="/jobs" />}>
          {ar.landing.browseJobs}
        </Button>
      </section>

      {jobs.length > 0 && (
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-24">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{ar.jobs.featuredTitle}</h2>
            <Link
              href="/jobs"
              className="text-sm text-primary hover:underline"
            >
              {ar.jobs.viewAll}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
