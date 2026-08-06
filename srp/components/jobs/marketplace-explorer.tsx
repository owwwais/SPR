"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, LayoutGrid, List, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobCard, type PublicJob } from "@/components/jobs/job-card";
import { ar } from "@/lib/i18n/ar";
import type { JobType } from "@/types/database";

export type CompanyGroup = {
  company: {
    id: string;
    slug: string;
    name: string;
    industry: string | null;
    city: string | null;
    logoUrl: string | null;
  };
  jobs: PublicJob[];
};

const JOB_TYPES: JobType[] = [
  "full_time",
  "part_time",
  "contract",
  "remote",
  "internship",
];

// Two ways to read the same list: grouped by employer (the default — most
// visitors are comparing companies) and flat (for someone who only cares
// about the role).
export function MarketplaceExplorer({ groups }: { groups: CompanyGroup[] }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<JobType | "">("");
  const [grouped, setGrouped] = useState(true);
  const t = ar.marketplace;

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const group of groups) {
      for (const job of group.jobs) if (job.location) set.add(job.location);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [groups]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        jobs: group.jobs.filter((job) => {
          if (city && job.location !== city) return false;
          if (type && job.type !== type) return false;
          if (!needle) return true;
          return (
            job.title.toLowerCase().includes(needle) ||
            group.company.name.toLowerCase().includes(needle) ||
            (job.department ?? "").toLowerCase().includes(needle)
          );
        }),
      }))
      .filter((group) => group.jobs.length > 0);
  }, [groups, query, city, type]);

  const total = filtered.reduce((sum, group) => sum + group.jobs.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="ps-9"
            aria-label={t.searchPlaceholder}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label={ar.jobs.filterLocation}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">{ar.jobs.filterLocation}</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value as JobType | "")}
            aria-label={ar.jobs.filterType}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">{ar.jobs.filterType}</option>
            {JOB_TYPES.map((value) => (
              <option key={value} value={value}>
                {ar.jobs.typeLabels[value]}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGrouped((value) => !value)}
            className="ms-auto"
          >
            {grouped ? (
              <>
                <List className="size-4" aria-hidden />
                {t.flatList}
              </>
            ) : (
              <>
                <LayoutGrid className="size-4" aria-hidden />
                {t.groupByCompany}
              </>
            )}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground tabular-nums">
          {total} {t.jobsCount}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-20 text-center">
          <Building2 className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.jobs.noResultsTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {ar.jobs.noResultsBody}
          </p>
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-6">
          {filtered.map((group) => (
            <section
              key={group.company.id}
              className="overflow-hidden rounded-xl border"
            >
              <header className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                  {group.company.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={group.company.logoUrl}
                      alt=""
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <Building2
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </span>
                <Link
                  href={`/c/${group.company.slug}`}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {group.company.name}
                </Link>
                {group.company.city && (
                  <span className="text-sm text-muted-foreground">
                    {group.company.city}
                  </span>
                )}
                <Badge variant="secondary" className="tabular-nums">
                  {group.jobs.length} {t.jobsCount}
                </Badge>
                <Link
                  href={`/c/${group.company.slug}`}
                  className="ms-auto text-sm text-primary hover:underline"
                >
                  {t.viewCompany}
                </Link>
              </header>
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.flatMap((group) =>
            group.jobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-1">
                <JobCard job={job} />
                <Link
                  href={`/c/${group.company.slug}`}
                  className="px-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  {group.company.name}
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
