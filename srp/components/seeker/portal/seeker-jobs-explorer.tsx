"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SeekerJobCard,
  type SeekerJob,
} from "@/components/seeker/portal/seeker-job-card";
import { ar } from "@/lib/i18n/ar";
import type { JobType } from "@/types/database";

const JOB_TYPES: JobType[] = [
  "full_time",
  "part_time",
  "contract",
  "remote",
  "internship",
];

const PAGE_SIZE = 24;

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25";

// The marketplace, read by a seeker. Same data and the same three filters
// as the public explorer (lib/marketplace.ts — published jobs of live,
// listed companies), with a flat list because each card now carries its
// company and an apply action of its own. No ranking and no "fits you"
// signal: explainable recommendations arrive with P2 (D28).
export function SeekerJobsExplorer({ jobs }: { jobs: SeekerJob[] }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<JobType | "">("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const t = ar.marketplace;

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const job of jobs) if (job.location) set.add(job.location);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [jobs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (city && job.location !== city) return false;
      if (type && job.type !== type) return false;
      if (!needle) return true;
      return (
        job.title.toLowerCase().includes(needle) ||
        job.company.name.toLowerCase().includes(needle) ||
        (job.department ?? "").toLowerCase().includes(needle)
      );
    });
  }, [jobs, query, city, type]);

  // A changed filter starts the list from the top again.
  const resetPaging = () => setVisible(PAGE_SIZE);

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
            onChange={(e) => {
              setQuery(e.target.value);
              resetPaging();
            }}
            placeholder={t.searchPlaceholder}
            className="ps-9"
            aria-label={t.searchPlaceholder}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              resetPaging();
            }}
            aria-label={ar.jobs.filterLocation}
            className={SELECT_CLASS}
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
            onChange={(e) => {
              setType(e.target.value as JobType | "");
              resetPaging();
            }}
            aria-label={ar.jobs.filterType}
            className={SELECT_CLASS}
          >
            <option value="">{ar.jobs.filterType}</option>
            {JOB_TYPES.map((value) => (
              <option key={value} value={value}>
                {ar.jobs.typeLabels[value]}
              </option>
            ))}
          </select>

          <p className="ms-auto text-sm text-muted-foreground tabular-nums">
            {filtered.length} {ar.seekerPortal.jobs.count}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
            <SearchX className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-base font-semibold">{ar.jobs.noResultsTitle}</h2>
          <p className="text-sm text-muted-foreground">{ar.jobs.noResultsBody}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, visible).map((job) => (
              <SeekerJobCard key={job.id} job={job} />
            ))}
          </div>
          {filtered.length > visible && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
              >
                {ar.seekerPortal.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
