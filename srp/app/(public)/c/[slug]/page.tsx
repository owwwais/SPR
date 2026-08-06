import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Building2, Globe, MapPin } from "lucide-react";
import { JobCard, type PublicJob } from "@/components/jobs/job-card";
import { Markdown } from "@/components/markdown";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";

export const revalidate = 60; // FR-02: ISR

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type Company = {
  id: string;
  slug: string;
  name: string;
  about: string | null;
  website: string | null;
  industry: string | null;
  city: string | null;
  brand_color: string | null;
  logo_path: string | null;
  cover_path: string | null;
};

// A tenant's careers page is public whenever the organization is live —
// `listed_publicly` only governs whether it also appears in the shared
// marketplace, not whether the company can hand out its own link.
const getCompany = cache(async (slug: string) => {
  if (!SLUG_RE.test(slug)) return null;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id, slug, name, about, website, industry, city, brand_color, logo_path, cover_path"
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("company query failed:", error.message);
      return null;
    }
    return data as Company | null;
  } catch (err) {
    console.warn(
      "company page unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
});

async function getCompanyJobs(orgId: string): Promise<PublicJob[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,department,location,type,closes_at,created_at")
      // The isolation invariant (§2.1): filter explicitly, do not lean on RLS.
      .eq("org_id", orgId)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("company jobs query failed:", error.message);
      return [];
    }
    return data;
  } catch {
    return [];
  }
}

function assetUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    return createPublicClient()
      .storage.from("org-assets")
      .getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) return { title: ar.company.notFoundTitle };
  return {
    title: `${ar.company.careersAt} ${company.name}`,
    description:
      company.about?.slice(0, 160) ??
      `${ar.company.careersAt} ${company.name}`,
  };
}

export default async function CompanyCareersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) notFound();

  const jobs = await getCompanyJobs(company.id);
  const logoUrl = assetUrl(company.logo_path);
  const coverUrl = assetUrl(company.cover_path);
  const t = ar.company;

  return (
    <>
      {/* The tenant's colour is applied inline and only here: it must never
          leak into the rest of the product's chrome. */}
      <div
        className="h-40 w-full bg-muted sm:h-56"
        style={
          coverUrl
            ? {
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : company.brand_color
              ? { backgroundColor: company.brand_color }
              : undefined
        }
      />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20">
        <div className="-mt-12 flex flex-col gap-4">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border-4 border-background bg-card">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt=""
                className="size-full object-contain p-2"
              />
            ) : (
              <Building2 className="size-10 text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold">{company.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {company.industry && <span>{company.industry}</span>}
              {company.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden />
                  {company.city}
                </span>
              )}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Globe className="size-3.5" aria-hidden />
                  {t.website}
                </a>
              )}
            </div>
          </div>
        </div>

        {company.about && (
          <div className="max-w-3xl">
            <Markdown text={company.about} />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">
            {t.openRoles}
            <span className="ms-2 text-base font-normal text-muted-foreground">
              ({jobs.length})
            </span>
          </h2>

          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium">{t.noJobsTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.noJobsBody}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t.poweredBy}{" "}
          <Link href="/" className="text-primary hover:underline">
            {ar.common.appName}
          </Link>
        </p>
      </section>
    </>
  );
}
