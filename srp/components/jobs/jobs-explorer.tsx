"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobCard, type PublicJob } from "./job-card";
import { ar } from "@/lib/i18n/ar";
import { JOB_TYPES } from "@/lib/validations/job";

// Client-side search + filters over the ISR-cached job list (FR-02).
// The list is small (single company), so filtering locally keeps the page
// statically cacheable and the UX instant.

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function distinct(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

export function JobsExplorer({ jobs }: { jobs: PublicJob[] }) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");

  const departments = useMemo(
    () => distinct(jobs.map((j) => j.department)),
    [jobs]
  );
  const locations = useMemo(() => distinct(jobs.map((j) => j.location)), [jobs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!needle || j.title.toLowerCase().includes(needle)) &&
        (!department || j.department === department) &&
        (!location || j.location === location) &&
        (!type || j.type === type)
    );
  }, [jobs, q, department, location, type]);

  const clearFilters = () => {
    setQ("");
    setDepartment("");
    setLocation("");
    setType("");
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <SearchX className="size-10 text-muted-foreground" aria-hidden />
        <h2 className="text-xl font-semibold">{ar.jobs.emptyTitle}</h2>
        <p className="text-sm text-muted-foreground">{ar.jobs.emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ar.jobs.searchPlaceholder}
            className="ps-9"
            aria-label={ar.jobs.searchPlaceholder}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={selectClass}
            aria-label={ar.jobs.filterDepartment}
          >
            <option value="">
              {ar.jobs.filterDepartment}: {ar.jobs.filterAll}
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={selectClass}
            aria-label={ar.jobs.filterLocation}
          >
            <option value="">
              {ar.jobs.filterLocation}: {ar.jobs.filterAll}
            </option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
            aria-label={ar.jobs.filterType}
          >
            <option value="">
              {ar.jobs.filterType}: {ar.jobs.filterAll}
            </option>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {ar.jobs.typeLabels[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.jobs.noResultsTitle}</h2>
          <p className="text-sm text-muted-foreground">{ar.jobs.noResultsBody}</p>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            {ar.jobs.clearFilters}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
