import type { Metadata } from "next";
import { ChartColumn } from "lucide-react";
import { format, subDays } from "date-fns";
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
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import type { AppStatus } from "@/types/database";

export const metadata: Metadata = {
  title: ar.stats.title,
};

const APP_STATUSES: AppStatus[] = [
  "new",
  "under_review",
  "interview",
  "accepted",
  "rejected",
];

export default async function AdminStatsPage() {
  await requireProfile();
  const supabase = await createClient();

  // Single-company volumes: aggregate in the server component (§8 pagination
  // applies to lists; stats read a bounded snapshot).
  const [appsRes, jobsRes] = await Promise.all([
    supabase
      .from("applications")
      .select("job_id, status, analysis_status, created_at, ai_evaluations(fit_score)")
      .limit(5000),
    supabase
      .from("jobs")
      .select("id, title, status")
      .is("deleted_at", null),
  ]);
  if (appsRes.error) console.error("stats applications query failed:", appsRes.error.message);
  if (jobsRes.error) console.error("stats jobs query failed:", jobsRes.error.message);
  const applications = appsRes.data ?? [];
  const jobs = jobsRes.data ?? [];

  // KPIs
  const scores = applications
    .map((a) => a.ai_evaluations?.fit_score)
    .filter((s): s is number => typeof s === "number");
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : null;
  const kpis = [
    { label: ar.stats.totalApplications, value: String(applications.length) },
    {
      label: ar.stats.publishedJobs,
      value: String(jobs.filter((j) => j.status === "published").length),
    },
    {
      label: `${ar.stats.avgFitScore} (${ar.evaluation.advisory})`,
      value: avgScore === null ? "—" : String(avgScore),
    },
    {
      label: ar.stats.awaitingAnalysis,
      value: String(
        applications.filter(
          (a) =>
            a.analysis_status === "pending" || a.analysis_status === "processing"
        ).length
      ),
    },
    {
      label: ar.stats.failedAnalyses,
      value: String(
        applications.filter((a) => a.analysis_status === "failed").length
      ),
    },
  ];

  // Per-job: application count + average fit score (FR-09)
  const perJob = jobs
    .map((job) => {
      const jobApps = applications.filter((a) => a.job_id === job.id);
      const jobScores = jobApps
        .map((a) => a.ai_evaluations?.fit_score)
        .filter((s): s is number => typeof s === "number");
      return {
        name: job.title,
        count: jobApps.length,
        avg:
          jobScores.length > 0
            ? Math.round(
                jobScores.reduce((sum, s) => sum + s, 0) / jobScores.length
              )
            : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Status funnel
  const funnel = APP_STATUSES.map((status) => ({
    name: ar.status[status],
    count: applications.filter((a) => a.status === status).length,
  }));

  // Applications over the last 30 days (gaps filled with zeros)
  const today = new Date();
  const overTime = Array.from({ length: 30 }, (_, i) => {
    const day = subDays(today, 29 - i);
    const key = format(day, "yyyy-MM-dd");
    return {
      date: format(day, "d MMM", { locale: arSA }),
      count: applications.filter((a) => a.created_at.slice(0, 10) === key)
        .length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.stats.title}</h1>

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

      {applications.length === 0 ? (
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
