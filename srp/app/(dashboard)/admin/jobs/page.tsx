import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Briefcase } from "lucide-react";
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
import { JobRowMenu } from "@/components/admin/job-row-menu";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import { formatDate } from "@/lib/format";
import type { JobStatus } from "@/types/database";
import { closeJob, deleteJob, publishJob } from "./actions";

export const metadata: Metadata = {
  title: ar.adminJobs.title,
};

const PAGE_SIZE = 10;
const STATUSES: JobStatus[] = ["draft", "published", "closed"];

const statusBadgeVariant: Record<JobStatus, "secondary" | "default" | "outline"> = {
  draft: "secondary",
  published: "default",
  closed: "outline",
};

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; error?: string }>;
}) {
  const session = await requireMembership();
  const sp = await searchParams;

  const statusFilter = STATUSES.includes(sp.status as JobStatus)
    ? (sp.status as JobStatus)
    : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const errorKey = sp.error as keyof typeof ar.adminJobs.errors | undefined;
  const errorMessage =
    errorKey && errorKey in ar.adminJobs.errors
      ? ar.adminJobs.errors[errorKey]
      : null;

  const supabase = await createClient();
  let query = supabase
    .from("jobs")
    // Applicant counts ride along as two filtered aggregates, so the list
    // says which job needs attention without a query per row.
    .select(
      "id,title,department,type,status,closes_at,created_at,total:applications(count),fresh:applications(count)",
      { count: "exact" }
    )
    .eq("org_id", session.org.id)
    .is("deleted_at", null)
    .eq("total.org_id", session.org.id)
    .eq("fresh.org_id", session.org.id)
    .eq("fresh.status", "new")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, count, error } = await query;
  if (error) console.error("admin jobs query failed:", error.message);
  type JobRow = {
    id: string;
    title: string;
    department: string | null;
    type: keyof typeof ar.jobs.typeLabels;
    status: JobStatus;
    closes_at: string | null;
    total: { count: number }[] | null;
    fresh: { count: number }[] | null;
  };
  const jobs = data as unknown as JobRow[] | null;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterHref = (status: JobStatus | null) =>
    status ? `/admin/jobs?status=${status}` : "/admin/jobs";
  const pageHref = (p: number) =>
    `/admin/jobs?${new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
      page: String(p),
    })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{ar.adminJobs.title}</h1>
        {/* "وظيفة جديدة" lives in the top bar on every workspace page. */}
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>
            {errorMessage}
            {errorKey === "activeJobLimit" && (
              <>
                {" "}
                <Link href="/admin/billing" className="font-medium underline underline-offset-4">
                  {ar.shell.billing}
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          nativeButton={false}
          render={<Link href={filterHref(null)} />}
        >
          {ar.jobs.filterAll}
        </Button>
        {STATUSES.map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={filterHref(status)} />}
          >
            {ar.adminJobs.statusLabels[status]}
          </Button>
        ))}
      </div>

      {!jobs || jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <Briefcase className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">
            {statusFilter ? ar.jobs.noResultsTitle : ar.adminJobs.emptyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {statusFilter ? ar.jobs.noResultsBody : ar.adminJobs.emptyBody}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar.adminJobs.table.jobTitle}</TableHead>
                <TableHead>{ar.adminJobs.table.applicants}</TableHead>
                <TableHead>{ar.adminJobs.table.status}</TableHead>
                <TableHead className="hidden md:table-cell">{ar.adminJobs.table.closesAt}</TableHead>
                <TableHead className="text-end">
                  <span className="sr-only">{ar.adminJobs.table.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const total = job.total?.[0]?.count ?? 0;
                const fresh = job.fresh?.[0]?.count ?? 0;
                return (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-80">
                      <Link
                        href={`/admin/jobs/${job.id}/applicants`}
                        className="flex flex-col gap-0.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
                      >
                        <span className="truncate font-medium hover:text-primary">{job.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[job.department, ar.jobs.typeLabels[job.type]].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 tabular-nums">
                        <bdi>{total}</bdi>
                        {fresh > 0 && (
                          <span className="rounded-sm bg-primary-soft px-1.5 text-xs font-semibold text-primary-soft-foreground">
                            <bdi>{fresh}</bdi> {ar.adminJobs.table.newApplicants}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[job.status]}>
                        {ar.adminJobs.statusLabels[job.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {job.closes_at ? <bdi>{formatDate(job.closes_at)}</bdi> : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {job.status !== "published" ? (
                          <form action={publishJob.bind(null, job.id)}>
                            <Button type="submit" variant="outline" size="sm">
                              {job.status === "closed"
                                ? ar.adminJobs.actions.republish
                                : ar.adminJobs.actions.publish}
                            </Button>
                          </form>
                        ) : (
                          <form action={closeJob.bind(null, job.id)}>
                            <Button type="submit" variant="ghost" size="sm">
                              {ar.adminJobs.actions.close}
                            </Button>
                          </form>
                        )}
                        <JobRowMenu
                          jobId={job.id}
                          published={job.status === "published"}
                          deleteAction={deleteJob.bind(null, job.id)}
                        />
                      </div>
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
