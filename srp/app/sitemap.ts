import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";

// Only pages that are genuinely public and genuinely useful to index:
// the marketing surfaces, the directory, each listed company's careers page,
// and each published job. Nothing behind /admin, and nothing belonging to an
// unlisted or suspended tenant.
export const revalidate = 3600;

function siteUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_ROOT_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
      : null);
  return raw ? raw.replace(/\/$/, "") : null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // Without a configured domain a sitemap of relative URLs is worse than
  // none: search engines reject it and it invites indexing a preview host.
  if (!base) return [];

  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/jobs`, lastModified: now, priority: 0.9 },
    { url: `${base}/companies`, lastModified: now, priority: 0.8 },
    { url: `${base}/pricing`, lastModified: now, priority: 0.7 },
    { url: `${base}/fairness`, lastModified: now, priority: 0.7 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, priority: 0.3 },
  ];

  try {
    const supabase = createPublicClient();

    const [companiesRes, jobsRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("slug, created_at")
        .eq("listed_publicly", true)
        .is("deleted_at", null)
        .in("status", ["trial", "active"])
        .limit(5000),
      supabase
        .from("jobs")
        .select(
          "id, created_at, organizations!inner(listed_publicly, status, deleted_at)"
        )
        .eq("status", "published")
        .is("deleted_at", null)
        .eq("organizations.listed_publicly", true)
        .is("organizations.deleted_at", null)
        .in("organizations.status", ["trial", "active"])
        .limit(5000),
    ]);

    const companies = (companiesRes.data ?? []) as {
      slug: string;
      created_at: string;
    }[];
    const jobs = (jobsRes.data ?? []) as { id: string; created_at: string }[];

    return [
      ...staticEntries,
      ...companies.map((company) => ({
        url: `${base}/c/${company.slug}`,
        lastModified: new Date(company.created_at),
        priority: 0.6,
      })),
      ...jobs.map((job) => ({
        url: `${base}/jobs/${job.id}`,
        lastModified: new Date(job.created_at),
        priority: 0.8,
      })),
    ];
  } catch (err) {
    console.warn(
      "sitemap data unavailable:",
      err instanceof Error ? err.message : err
    );
    return staticEntries;
  }
}
