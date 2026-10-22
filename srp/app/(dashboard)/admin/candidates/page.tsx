import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import { formatDate } from "@/lib/format";

// Advanced feature #6: search every applicant the organization has already
// paid to have analyzed, across every job, by skill — not just the one job
// a ranked list happens to be scoped to.

export const metadata: Metadata = {
  title: ar.candidates.title,
};

const PAGE_SIZE = 20;

type SearchResult = {
  application_id: string;
  full_name: string;
  job_title: string;
  status: string;
  fit_score: number | null;
  skills: string[] | null;
  applied_at: string;
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireMembership();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_candidates", {
    p_org: session.org.id,
    p_skill: q.length > 0 ? q : null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) console.error("search_candidates failed:", error.message);

  const payload = (data as { total: number; results: SearchResult[] } | null) ?? {
    total: 0,
    results: [],
  };
  const totalPages = Math.max(1, Math.ceil(payload.total / PAGE_SIZE));

  const pageHref = (p: number) =>
    `/admin/candidates?${new URLSearchParams({
      ...(q ? { q } : {}),
      page: String(p),
    })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.candidates.title}</h1>
      <p className="text-sm text-muted-foreground">{ar.candidates.hint}</p>

      <form method="get" className="flex max-w-md gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={ar.candidates.searchPlaceholder}
        />
        <Button type="submit" size="sm">
          <Search className="size-4" aria-hidden />
          {ar.candidates.search}
        </Button>
      </form>

      {payload.results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <Users className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">
            {q ? ar.candidates.noResultsTitle : ar.candidates.emptyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {q ? ar.candidates.noResultsBody : ar.candidates.emptyBody}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar.candidates.table.name}</TableHead>
                <TableHead>{ar.candidates.table.job}</TableHead>
                <TableHead title={ar.evaluation.advisoryTooltip}>
                  {ar.candidates.table.score} ({ar.evaluation.advisory})
                </TableHead>
                <TableHead>{ar.candidates.table.status}</TableHead>
                <TableHead>{ar.candidates.table.skills}</TableHead>
                <TableHead>{ar.candidates.table.appliedAt}</TableHead>
                <TableHead>{ar.candidates.table.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payload.results.map((r) => (
                <TableRow key={r.application_id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.job_title}
                  </TableCell>
                  <TableCell>
                    {r.fit_score !== null ? (
                      <ScoreBadge score={r.fit_score} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ar.status[r.status as keyof typeof ar.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {(r.skills ?? []).slice(0, 4).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {(r.skills?.length ?? 0) > 4 && (
                        <span className="text-xs text-muted-foreground">
                          +{(r.skills?.length ?? 0) - 4}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.applied_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`/admin/applications/${r.application_id}`} />
                      }
                    >
                      {ar.applicants.view}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(page - 1)} />}
            >
              {ar.adminJobs.pagination.previous}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(page + 1)} />}
            >
              {ar.adminJobs.pagination.next}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
