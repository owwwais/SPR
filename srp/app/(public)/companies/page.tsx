import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { assetUrl, getListedCompanies } from "@/lib/marketplace";
import { ar } from "@/lib/i18n/ar";

export const revalidate = 60;

export const metadata: Metadata = {
  title: ar.marketplace.directoryTitle,
  description: ar.marketplace.directorySubtitle,
};

export default async function CompaniesPage() {
  const companies = await getListedCompanies();
  const t = ar.marketplace;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t.directoryTitle}</h1>
        <p className="text-muted-foreground">{t.directorySubtitle}</p>
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-20 text-center">
          <Building2 className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{t.directoryEmptyTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {t.directoryEmptyBody}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const logoUrl = assetUrl(company.logo_path);
            return (
              <Link
                key={company.id}
                href={`/c/${company.slug}`}
                className="group flex flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                    {logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={logoUrl}
                        alt=""
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <Building2
                        className="size-5 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <h2 className="truncate font-semibold group-hover:text-primary">
                      {company.name}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {[company.industry, company.city]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                </div>

                {company.about && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {company.about}
                  </p>
                )}

                <Badge
                  variant={company.openRoles > 0 ? "default" : "secondary"}
                  className="w-fit tabular-nums"
                >
                  {company.openRoles > 0
                    ? `${company.openRoles} ${t.openRoles}`
                    : t.noOpenRoles}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
