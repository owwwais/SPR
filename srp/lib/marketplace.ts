import { createPublicClient } from "@/lib/supabase/public";
import type { PublicJob } from "@/components/jobs/job-card";

// Shared reads for the public marketplace (S6, D21).
//
// Two conditions gate everything here, and both are enforced by RLS as well:
//   * the job is published and not soft-deleted
//   * its organization is live AND has opted into the directory
//
// `listed_publicly` is the tenant's own switch. Turning it off removes them
// from these pages but leaves /c/{slug} working, so a company that recruits
// only through its own site is not forced into the shared listing.

export type MarketplaceCompany = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  city: string | null;
  logo_path: string | null;
};

export type CompanyWithJobs = {
  company: MarketplaceCompany;
  jobs: PublicJob[];
};

type JobRow = PublicJob & {
  org_id: string;
  organizations: MarketplaceCompany | null;
};

export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    return createPublicClient()
      .storage.from("org-assets")
      .getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/**
 * Every published job from every listed company, grouped by company and
 * ordered by how recently each company posted.
 */
export async function getMarketplaceJobs(): Promise<CompanyWithJobs[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id,title,department,location,type,closes_at,created_at,org_id,organizations!inner(id,slug,name,industry,city,logo_path,status,listed_publicly,deleted_at)"
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("organizations.listed_publicly", true)
      .is("organizations.deleted_at", null)
      .in("organizations.status", ["trial", "active"])
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("marketplace query failed:", error.message);
      return [];
    }

    const rows = (data ?? []) as unknown as JobRow[];
    const grouped = new Map<string, CompanyWithJobs>();

    for (const row of rows) {
      const company = row.organizations;
      if (!company) continue;
      const existing = grouped.get(company.id);
      const { organizations: _org, org_id: _orgId, ...job } = row;
      void _org;
      void _orgId;
      if (existing) {
        existing.jobs.push(job);
      } else {
        grouped.set(company.id, { company, jobs: [job] });
      }
    }

    // Rows arrive newest-first, so insertion order already ranks companies by
    // most recent posting.
    return Array.from(grouped.values());
  } catch (err) {
    console.warn(
      "marketplace unavailable:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

export type CompanyWithCount = MarketplaceCompany & {
  about: string | null;
  openRoles: number;
};

/** The directory: listed companies with a count of their open roles. */
export async function getListedCompanies(): Promise<CompanyWithCount[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("organizations")
      .select("id, slug, name, industry, city, logo_path, about")
      .eq("listed_publicly", true)
      .is("deleted_at", null)
      .in("status", ["trial", "active"])
      .order("name", { ascending: true })
      .limit(500);

    if (error) {
      console.error("companies query failed:", error.message);
      return [];
    }

    const companies = (data ?? []) as unknown as Omit<
      CompanyWithCount,
      "openRoles"
    >[];
    if (companies.length === 0) return [];

    // One extra query for all counts rather than one per company.
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("org_id")
      .eq("status", "published")
      .is("deleted_at", null)
      .in(
        "org_id",
        companies.map((company) => company.id)
      )
      .limit(2000);

    const counts = new Map<string, number>();
    for (const row of (jobRows ?? []) as { org_id: string }[]) {
      counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
    }

    return companies.map((company) => ({
      ...company,
      openRoles: counts.get(company.id) ?? 0,
    }));
  } catch (err) {
    console.warn(
      "company directory unavailable:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
