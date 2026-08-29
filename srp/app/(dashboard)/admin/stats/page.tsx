import type { Metadata } from "next";
import { ChartColumn } from "lucide-react";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DailyAreaChart,
  HorizontalCountChart,
} from "@/components/admin/stats-charts";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import type { AppStatus } from "@/types/database";

export const metadata: Metadata = {
  title: ar.stats.title,
};


// Shape returned by the org_stats() RPC (migration 0013). The aggregation
// runs in the database; this page only formats it.
type OrgStats = {
  totals: {
    applications: number;
    avg_fit_score: number | null;
    awaiting_analysis: number;
    failed_analyses: number;
  };
  published_jobs: number;
  per_job: { name: string; count: number; avg: number | null }[];
  funnel: { status: AppStatus; count: number }[];
  over_time: { date: string; count: number }[];
};

export default async function AdminStatsPage() {
  const session = await requireMembership();
  const supabase = await createClient();

  // One call, one small document. This page used to fetch up to 5,000
  // application rows and aggregate them in JavaScript, which was both wrong
  // and wasteful: an organization past that ceiling had the remainder
  // silently dropped, so every figure here was computed on a truncated set
  // and shown as fact. Measured on 8,000 applications, the old query returned
  // 5,000 rows and about 766 kB; org_stats returns one row of roughly 2.6 kB
  // with the real totals.
  const [statsRes, quotaRes] = await Promise.all([
    supabase.rpc("org_stats", { p_org: session.org.id }),
    supabase.rpc("org_quota", { p_org: session.org.id }),
  ]);
  const { data, error } = statsRes;
  if (error) console.error("org_stats failed:", error.message);
  if (quotaRes.error) console.error("org_quota failed:", quotaRes.error.message);

  // D16 enforces the ceiling inside analyze-application; showing it here is
  // what stops exhaustion from arriving as a surprise pile of failed
  // analyses the customer cannot explain.
  const quota = (quotaRes.data as {
    used: number;
    quota: number | null;
    remaining: number | null;
  } | null) ?? { used: 0, quota: null, remaining: null };

  const stats = (data as OrgStats | null) ?? {
    totals: {
      applications: 0,
      avg_fit_score: null,
      awaiting_analysis: 0,
      failed_analyses: 0,
    },
    published_jobs: 0,
    per_job: [],
    funnel: [],
    over_time: [],
  };

  const kpis = [
    { label: ar.stats.totalApplications, value: String(stats.totals.applications) },
    { label: ar.stats.publishedJobs, value: String(stats.published_jobs) },
    {
      label: `${ar.stats.avgFitScore} (${ar.evaluation.advisory})`,
      value:
        stats.totals.avg_fit_score === null
          ? "—"
          : String(stats.totals.avg_fit_score),
    },
    { label: ar.stats.awaitingAnalysis, value: String(stats.totals.awaiting_analysis) },
    { label: ar.stats.failedAnalyses, value: String(stats.totals.failed_analyses) },
  ];

  const perJob = stats.per_job;
  const totalApplications = stats.totals.applications;

  // The database returns every status and every one of the last 30 days,
  // including the empty ones, so there are no gaps to fill here.
  const funnel = stats.funnel.map((row) => ({
    name: ar.status[row.status],
    count: row.count,
  }));

  const overTime = stats.over_time.map((row) => ({
    date: format(new Date(row.date), "d MMM", { locale: arSA }),
    count: row.count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.stats.title}</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {ar.quota.title}
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {quota.quota === null
                ? ar.quota.unlimited
                : `${quota.used} ${ar.quota.ofTotal} ${quota.quota} ${ar.quota.unit}`}
            </span>
          </div>
          {quota.quota !== null && quota.remaining !== null && (
            <span
              className={
                quota.remaining === 0
                  ? "text-sm font-medium text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {quota.remaining === 0
                ? ar.quota.exhaustedTitle
                : `${ar.quota.remaining}: ${quota.remaining}`}
            </span>
          )}
        </CardContent>
      </Card>

      {quota.remaining === 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium">{ar.quota.exhaustedTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar.quota.exhaustedBody}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              <span className="text-3xl font-bold tabular-nums">
                {kpi.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalApplications === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <ChartColumn className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.stats.emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">{ar.stats.emptyBody}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{ar.stats.applicationsPerJob}</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalCountChart
                  data={perJob.filter((j) => j.count > 0)}
                  valueLabel={ar.stats.applicationsUnit}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{ar.stats.statusFunnel}</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalCountChart
                  data={funnel}
                  color="var(--chart-3)"
                  valueLabel={ar.stats.applicationsUnit}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{ar.stats.applicationsOverTime}</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyAreaChart data={overTime} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar.stats.perJobTable.title}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar.stats.perJobTable.job}</TableHead>
                    <TableHead>{ar.stats.perJobTable.count}</TableHead>
                    <TableHead title={ar.evaluation.advisoryTooltip}>
                      {ar.stats.perJobTable.avg} ({ar.evaluation.advisory})
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perJob.map((job) => (
                    <TableRow key={job.name}>
                      <TableCell className="font-medium">{job.name}</TableCell>
                      <TableCell className="tabular-nums">{job.count}</TableCell>
                      <TableCell>
                        {job.avg === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ScoreBadge score={job.avg} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
