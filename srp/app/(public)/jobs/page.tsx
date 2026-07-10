import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import type { PublicJob } from "@/components/jobs/job-card";
import { ar } from "@/lib/i18n/ar";

export const revalidate = 60; // FR-02: ISR

export const metadata: Metadata = {
  title: ar.nav.jobs,
};

async function getPublishedJobs(): Promise<PublicJob[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,department,location,type,closes_at,created_at")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("jobs list query failed:", error.message);
      return [];
    }
    return data;
  } catch (err) {
    // e.g. building without Supabase env — page revalidates once deployed.
    console.warn("jobs list unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function JobsPage() {
  const jobs = await getPublishedJobs();

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">{ar.jobs.listTitle}</h1>
      <JobsExplorer jobs={jobs} />
    </section>
  );
}
