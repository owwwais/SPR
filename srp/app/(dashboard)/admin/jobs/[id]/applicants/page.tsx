import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireProfile } from "@/lib/auth";
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
  searchParams: Promise<{ status?: string; page?: string; error?: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;

  const statusFilter = APP_STATUSES.includes(sp.status as AppStatus)
    ? (sp.status as AppStatus)
    : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const showRetryError = sp.error === "retryFailed";

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  // FR-06: ranked by fit_score desc, nulls (not yet analyzed) last.
  let query = supabase
    .from("applications")
    .select(
      "id, full_name, email, status, analysis_status, analysis_attempts, created_at, ai_evaluations(fit_score)",
      { count: "exact" }
    )
    .eq("job_id", id)
    .order("ai_evaluations(fit_score)", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: applicants, count, error } = await query;
  if (error) console.error("applicants query failed:", error.message);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPath = `/admin/jobs/${id}/applicants`;

  const filterHref = (status: AppStatus | null) =>
    status ? `${currentPath}?status=${status}` : currentPath;
  const pageHref = (p: number) =>
    `${currentPath}?${new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
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
        <h1 className="text-2xl font-bold">
          {ar.applicants.title}: {job.title}
        </h1>
      </div>

      {showRetryError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{ar.applicants.errors.retryFailed}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          nativeButton={false}
          render={<Link href={filterHref(null)} />}
        >
          {ar.applicants.filterAll}
        </Button>
        {APP_STATUSES.map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={filterHref(status)} />}
          >
            {ar.status[status]}
          </Button>
        ))}
      </div>

      {!applicants || applicants.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <Users className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">
            {statusFilter
              ? ar.applicants.noResultsTitle
              : ar.applicants.emptyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {statusFilter ? ar.applicants.noResultsBody : ar.applicants.emptyBody}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar.applicants.table.rank}</TableHead>
                <TableHead>{ar.applicants.table.name}</TableHead>
                <TableHead title={ar.evaluation.advisoryTooltip}>
                  {ar.applicants.table.score} ({ar.evaluation.advisory})
                </TableHead>
                <TableHead>{ar.applicants.table.appStatus}</TableHead>
                <TableHead>{ar.applicants.table.analysis}</TableHead>
                <TableHead>{ar.applicants.table.appliedAt}</TableHead>
                <TableHead>{ar.applicants.table.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicants.map((applicant, index) => {
                const fitScore = applicant.ai_evaluations?.fit_score ?? null;
                return (
                  <TableRow key={applicant.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {applicant.full_name}
                        </span>
                        <span dir="ltr" className="text-xs text-muted-foreground">
                          {applicant.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {fitScore !== null ? (
                        <ScoreBadge score={fitScore} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ar.status[applicant.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AnalysisIndicator
                        status={applicant.analysis_status}
                        attempts={applicant.analysis_attempts}
                        applicationId={applicant.id}
                        returnPath={currentPath}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(applicant.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link href={`/admin/applications/${applicant.id}`} />
                        }
                      >
                        {ar.applicants.view}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
    </span>
  );
}
