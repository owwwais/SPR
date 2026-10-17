import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMarketplaceJobs } from "@/lib/marketplace";
import { todayISO } from "@/lib/format";
import {
  parseHistory,
  type HistoryEntry,
} from "@/components/seeker/portal/application-timeline";
import type { SeekerJob } from "@/components/seeker/portal/seeker-job-card";
import type { AppStatus } from "@/types/database";

// Reads shared by the /me pages.
//
// Applications come only from my_applications(): a security definer
// function that returns the caller's own rows (applicant_user_id =
// auth.uid()) with job title, company and status history — and nothing from
// ai_evaluations, by construction (FR-08 parity). A seeker holds no table
// grant that would let them read applications any other way, and no org_id
// is involved: the filter is the caller's identity, applied in SQL.

export type MyApplication = {
  id: string;
  ref_code: string;
  job_id: string;
  job_title: string;
  org_name: string;
  org_slug: string;
  status: AppStatus;
  created_at: string;
  history: HistoryEntry[];
};

type ApplicationRow = Omit<MyApplication, "history"> & { history: unknown };

export type ApplicationsPage = {
  rows: MyApplication[];
  total: number;
  /** false when the lookup failed — distinct from "you have none". */
  ok: boolean;
};

/** One page of the caller's applications, newest first. */
export async function getMyApplications(
  page: number,
  pageSize: number
): Promise<ApplicationsPage> {
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .rpc("my_applications", {}, { count: "exact" })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error("my_applications failed:", error.message);
    return { rows: [], total: 0, ok: false };
  }
  const rows = ((data ?? []) as ApplicationRow[]).map((row) => ({
    ...row,
    history: parseHistory(row.history),
  }));
  return { rows, total: count ?? rows.length, ok: true };
}

/** Ids of the jobs the caller already applied to with their account. */
export const getAppliedJobIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("my_applications")
    .select("job_id");
  if (error) {
    console.error("my_applications (job ids) failed:", error.message);
    return new Set();
  }
  return new Set(
    ((data ?? []) as { job_id: string }[]).map((row) => row.job_id)
  );
});

/**
 * The marketplace as a seeker reads it: every published job of every live,
 * listed company, newest first, each with its company and whether this
 * seeker already applied. null when the marketplace could not be read.
 */
export async function getSeekerJobs(): Promise<SeekerJob[] | null> {
  const [groups, applied] = await Promise.all([
    getMarketplaceJobs(),
    getAppliedJobIds(),
  ]);
  if (groups === null) return null;

  const today = todayISO();
  const jobs: SeekerJob[] = [];
  for (const { company, jobs: companyJobs } of groups) {
    for (const job of companyJobs) {
      jobs.push({
        ...job,
        company: { name: company.name, slug: company.slug },
        closed: job.closes_at !== null && job.closes_at < today,
        applied: applied.has(job.id),
      });
    }
  }
  // Grouping ordered companies by their latest posting; a flat list reads
  // by the job's own date.
  jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return jobs;
}
