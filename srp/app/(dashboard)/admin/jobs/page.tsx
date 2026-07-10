import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Briefcase, Plus } from "lucide-react";
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
import { DeleteJobButton } from "@/components/admin/delete-job-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import { formatDate } from "@/lib/format";
import type { JobStatus } from "@/types/database";
import { closeJob, publishJob } from "./actions";

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
  await requireProfile();
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
    .select("id,title,department,type,status,closes_at,created_at", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: jobs, count, error } = await query;
  if (error) console.error("admin jobs query failed:", error.message);

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
        <h1 className="text-2xl font-bold">{ar.adminJobs.title}</h1>
        <Button nativeButton={false} render={<Link href="/admin/jobs/new" />}>
          <Plus className="size-4" aria-hidden />
          {ar.adminJobs.newJob}
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{errorMessage}</AlertDescription>
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
                <TableHead>{ar.adminJobs.table.department}</TableHead>
                <TableHead>{ar.adminJobs.table.type}</TableHead>
                <TableHead>{ar.adminJobs.table.status}</TableHead>
                <TableHead>{ar.adminJobs.table.closesAt}</TableHead>
                <TableHead>{ar.adminJobs.table.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.department ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ar.jobs.typeLabels[job.type]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[job.status]}>
                      {ar.adminJobs.statusLabels[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.closes_at ? formatDate(job.closes_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link href={`/admin/jobs/${job.id}/applicants`} />
                        }
                      >
                        {ar.adminJobs.actions.applicants}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/admin/jobs/${job.id}/edit`} />}
                      >
                        {ar.adminJobs.actions.edit}
                      </Button>
                      {job.status !== "published" && (
                        <form action={publishJob.bind(null, job.id)}>
                          <Button type="submit" size="sm">
                            {job.status === "closed"
                              ? ar.adminJobs.actions.republish
                              : ar.adminJobs.actions.publish}
                          </Button>
                        </form>
                      )}
                      {job.status === "published" && (
                        <form action={closeJob.bind(null, job.id)}>
                          <Button type="submit" variant="secondary" size="sm">
                            {ar.adminJobs.actions.close}
                          </Button>
                        </form>
                      )}
                      <DeleteJobButton id={job.id} />
                    </div>
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
