import type { Metadata } from "next";
import { MarketplaceExplorer } from "@/components/jobs/marketplace-explorer";
import type { CompanyGroup } from "@/components/jobs/marketplace-explorer";
import { assetUrl, getMarketplaceJobs } from "@/lib/marketplace";
import { ar } from "@/lib/i18n/ar";

export const revalidate = 60; // FR-02: ISR

export const metadata: Metadata = {
  title: ar.marketplace.title,
  description: ar.marketplace.subtitle,
};

// D21: the shared job board is part of the product. Every listed tenant's
// published roles appear here, grouped by employer — the traffic loop that a
// single-tenant ATS cannot offer its customers.
export default async function JobsPage() {
  const grouped = await getMarketplaceJobs();

  const groups: CompanyGroup[] = grouped.map(({ company, jobs }) => ({
    company: {
      id: company.id,
      slug: company.slug,
      name: company.name,
      industry: company.industry,
      city: company.city,
      logoUrl: assetUrl(company.logo_path),
    },
    jobs,
  }));

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{ar.marketplace.title}</h1>
        <p className="text-muted-foreground">{ar.marketplace.subtitle}</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-20 text-center">
          <h2 className="text-lg font-semibold">
            {ar.marketplace.emptyTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar.marketplace.emptyBody}
          </p>
        </div>
      ) : (
        <MarketplaceExplorer groups={groups} />
      )}
    </section>
  );
}
