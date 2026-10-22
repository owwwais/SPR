import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import { ScreeningAnswers } from "@/lib/validations/screening";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import type { AppStatus } from "@/types/database";
import { reRunAnalysis } from "@/app/(dashboard)/admin/applications/actions";

export const metadata: Metadata = {
  title: ar.applicants.title,
};

const PAGE_SIZE = 20;
const APP_STATUSES: AppStatus[] = [
  "new",
  "under_review",
  "interview",
  "accepted",
  "rejected",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; page?: string; error?: string; q?: string }>;
}) {
  const session = await requireMembership();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;

  const statusFilter = APP_STATUSES.includes(sp.status as AppStatus)
    ? (sp.status as AppStatus)
    : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const showRetryError = sp.error === "retryFailed";
  // Name or email. Characters that mean something in a PostgREST filter
  // (, ( ) and the wildcards) are dropped, not escaped: nobody's name needs
  // them, and the term goes into an or() expression.
  const search = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id,title")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!job) notFound();

  // FR-06: ranked by fit_score desc, nulls (not yet analyzed) last.
  //
  // The score is read from applications, not from the embedded evaluation.
  // Ordering by the joined table made Postgres read every application for the
  // job, join every evaluation and sort the lot to return twenty — on every
  // page. applications.fit_score is a trigger-maintained copy (0013) and
  // applications_ranked_idx serves this exact order, so page one is now an
  // index read of twenty rows: measured 7.63 ms to 0.27 ms on a job with
  // 3,250 applicants. ai_evaluations stays the source of truth and the
  // applicant detail page still reads it there.
  let query = supabase
    .from("applications")
    .select(
      "id, full_name, email, status, analysis_status, analysis_attempts, created_at, fit_score, screening_answers",
      { count: "exact" }
    )
    .eq("org_id", session.org.id)
    .eq("job_id", id)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  // UI-E1: how many are in each stage, on the chips themselves. Six head
  // counts on the (org_id, job_id, status) index, in parallel with the page.
  const countFor = (status: AppStatus | null) => {
    let q = supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", session.org.id)
      .eq("job_id", id);
    if (status) q = q.eq("status", status);
    return q;
  };
  const [{ data: applicants, count, error }, ...stageCounts] = await Promise.all([
    query,
    countFor(null),
    ...APP_STATUSES.map((status) => countFor(status)),
  ]);
  if (error) console.error("applicants query failed:", error.message);
  const chipCount = (status: AppStatus | null) =>
    stageCounts[status === null ? 0 : APP_STATUSES.indexOf(status) + 1]?.count ?? null;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPath = `/admin/jobs/${id}/applicants`;

  const filterHref = (status: AppStatus | null) => {
    const params = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(search ? { q: search } : {}),
    }).toString();
    return params ? `${currentPath}?${params}` : currentPath;
  };
  const pageHref = (p: number) =>
    `${currentPath}?${new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { q: search } : {}),
      page: String(p),
    })}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/jobs"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {ar.adminJobs.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">
            {ar.applicants.title}: {job.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            {/* I1: the job's core question bank for virtual interviews. */}
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/admin/jobs/${id}/interview-bank`} />}
            >
              <ListChecks className="size-4" aria-hidden />
              {ar.interviewBank.applicantsLink}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={`${currentPath}/export`} />}
            >
              <Download className="size-4" aria-hidden />
              {ar.applicants.export.button}
            </Button>
          </div>
        </div>
      </div>

      {showRetryError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{ar.applicants.errors.retryFailed}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([null, ...APP_STATUSES] as (AppStatus | null)[]).map((status) => {
            const n = chipCount(status);
            return (
              <Button
                key={status ?? "all"}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                nativeButton={false}
                render={<Link href={filterHref(status)} />}
              >
                {status ? ar.status[status] : ar.applicants.filterAll}
                {n !== null && (
                  <span className="text-xs tabular-nums opacity-80">
                    <bdi>{n}</bdi>
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        <form role="search" className="flex w-full items-center gap-2 sm:w-72">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <label htmlFor="applicant-q" className="sr-only">
            {ar.applicants.searchPlaceholder}
          </label>
          <Input
            id="applicant-q"
            name="q"
            defaultValue={search}
            placeholder={ar.applicants.searchPlaceholder}
            className="h-8"
          />
          <Button type="submit" variant="outline" size="icon-sm" title={ar.applicants.search}>
            <Search className="size-4" aria-hidden />
            <span className="sr-only">{ar.applicants.search}</span>
          </Button>
        </form>
      </div>

      {!applicants || applicants.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <Users className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">
            {statusFilter || search
              ? ar.applicants.noResultsTitle
              : ar.applicants.emptyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {search
              ? ar.applicants.noSearchResults
              : statusFilter
                ? ar.applicants.noResultsBody
                : ar.applicants.emptyBody}
          </p>
        </div>
      ) : (
        // #5: a plain GET form — no client JS needed. Submitting with
        // exactly two checkboxes ticked lands on the compare page with
        // ?id=a&id=b; any other count and that page explains what to do
        // instead of guessing.
        <form
          method="get"
          action={`${currentPath}/compare`}
          className="flex flex-col gap-3"
        >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="hidden sm:table-cell">{ar.applicants.table.rank}</TableHead>
                <TableHead>{ar.applicants.table.name}</TableHead>
                <TableHead title={ar.evaluation.advisoryTooltip}>
                  {ar.applicants.table.score} ({ar.evaluation.advisory})
                </TableHead>
                <TableHead className="hidden md:table-cell">{ar.applicants.table.appStatus}</TableHead>
                <TableHead className="hidden lg:table-cell">{ar.applicants.table.analysis}</TableHead>
                <TableHead className="hidden lg:table-cell">{ar.applicants.table.appliedAt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicants.map((applicant, index) => {
                const fitScore = applicant.fit_score ?? null;
                // #11: flag for HR's attention only — never affects ranking
                // or an auto-reject (D4). "لا" is the literal stored value.
                const parsedAnswers = ScreeningAnswers.safeParse(
                  applicant.screening_answers
                );
                const flagged =
                  parsedAnswers.success &&
                  parsedAnswers.data.some(
                    (a) => a.disqualifying && a.answer === "لا"
                  );
                return (
                  <TableRow key={applicant.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        name="id"
                        value={applicant.id}
                        className="size-4 accent-primary"
                        aria-label={ar.applicants.compare.selectOne}
                      />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </TableCell>
                    <TableCell className="max-w-72">
                      {/* The name opens the dossier — as a side panel from
                          here (P4c), or the full page in a new tab. */}
                      <Link
                        href={`/admin/applications/${applicant.id}`}
                        className="group flex min-w-0 flex-col items-start rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
                      >
                        <span className="flex max-w-full items-center gap-1.5 font-medium group-hover:text-primary">
                          <span className="truncate">{applicant.full_name}</span>
                          {flagged && (
                            <TriangleAlert
                              className="size-3.5 text-warning"
                              aria-hidden
                            />
                          )}
                          <span className="sr-only">
                            {flagged ? ar.application.screeningFlag : ""}
                          </span>
                        </span>
                        <bdi dir="ltr" className="max-w-full truncate text-xs text-muted-foreground">
                          {applicant.email}
                        </bdi>
                        <span className="mt-1 text-xs text-muted-foreground md:hidden">
                          {ar.status[applicant.status]}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {fitScore !== null ? (
                        <ScoreBadge score={fitScore} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">
                        {ar.status[applicant.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <AnalysisIndicator
                        status={applicant.analysis_status}
                        attempts={applicant.analysis_attempts}
                        applicationId={applicant.id}
                        returnPath={currentPath}
                      />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      <bdi>{formatDate(applicant.created_at)}</bdi>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
          <Button type="submit" variant="outline" size="sm" className="self-start">
            {ar.applicants.compare.button}
          </Button>
        </form>
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

// FR-06 analysis-status indicator: spinner while pending/processing, retry
// button for failed, subtle check when done.
function AnalysisIndicator({
  status,
  attempts,
  applicationId,
  returnPath,
}: {
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  applicationId: string;
  returnPath: string;
}) {
  if (status === "pending" || status === "processing") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {status === "pending"
          ? ar.evaluation.pendingAnalysis
          : ar.evaluation.processingAnalysis}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <form action={reRunAnalysis.bind(null, applicationId, returnPath)}>
        <Button type="submit" variant="destructive" size="sm">
          <RefreshCw className="size-3.5" aria-hidden />
          {ar.evaluation.retry} ({attempts})
        </Button>
      </form>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-success" aria-hidden />
    </span>
  );
}
