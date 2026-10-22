import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, CreditCard, Scale } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTabs } from "@/components/admin/page-tabs";
import { ScoreBadge } from "@/components/admin/score-badge";
import { UsageMeter } from "@/components/admin/usage-meter";
import { requireMembership } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing";
import { formatDate, formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStatus } from "@/types/database";

export const metadata: Metadata = { title: ar.interviewsHub.title };

// The twelve agent states, folded into what a recruiter needs to know.
const GROUPS: Record<string, readonly InterviewStatus[]> = {
  preparing: ["draft", "planning"],
  review: ["awaiting_review"],
  open: ["scheduled", "open"],
  running: ["in_progress"],
  evaluating: ["submitted", "evaluating"],
  ready: ["evaluated"],
  closed: ["expired", "cancelled", "failed"],
};
type Group = keyof typeof ar.interviewsHub.groups;

const TABS = ["overview", "interviews", "banks", "reports"] as const;

type AssignmentRow = {
  id: string;
  application_id: string;
  status: string;
  question_count: number | null;
  duration_minutes: number | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  applications: { full_name: string; jobs: { title: string } | null } | null;
};
type BankRow = {
  id: string;
  job_id: string;
  version: number;
  status: string;
  question_count: number | null;
  approved_count: number | null;
  locked_at: string | null;
  jobs: { title: string } | null;
};
type ReportRow = {
  id: string;
  overall_score: number | null;
  confidence: string | null;
  received_at: string;
  interview_assignments: {
    application_id: string;
    applications: { full_name: string; jobs: { title: string } | null } | null;
  } | null;
};

// P4e: one place for virtual interviews (PRODUCT-READINESS-PROPOSAL §4.2).
// Everything here reads what the workspace already stores — no agent call,
// no model call — so it works with a zero interview allowance too (UI-J1).
// Every query filters by this organization in code; RLS is the second layer.
export default async function InterviewsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireMembership();
  const sp = await searchParams;
  const initial = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : "overview";
  const orgId = session.org.id;
  const t = ar.interviewsHub;
  const supabase = await createClient();

  const groupCount = (statuses: readonly InterviewStatus[]) =>
    supabase
      .from("interview_assignments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", statuses);

  const groupKeys = Object.keys(ar.interviewsHub.groups) as Group[];
  const [assignmentsRes, banksRes, reportsRes, billing, ...counts] = await Promise.all([
    supabase
      .from("interview_assignments")
      .select(
        "id, application_id, status, question_count, duration_minutes, opens_at, closes_at, created_at, applications(full_name, jobs(title))"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("interview_job_banks")
      .select("id, job_id, version, status, question_count, approved_count, locked_at, jobs(title)")
      .eq("org_id", orgId)
      .neq("status", "superseded")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("interview_reports")
      .select(
        "id, overall_score, confidence, received_at, interview_assignments(application_id, applications(full_name, jobs(title)))"
      )
      .eq("org_id", orgId)
      .order("received_at", { ascending: false })
      .limit(30),
    getBillingOverview(orgId),
    ...groupKeys.map((key) => groupCount(GROUPS[key])),
  ]);

  for (const [name, res] of [
    ["assignments", assignmentsRes],
    ["banks", banksRes],
    ["reports", reportsRes],
  ] as const) {
    if (res.error) console.error(`interviews hub ${name} failed:`, res.error.code, res.error.message);
  }
  const failedLoad = Boolean(assignmentsRes.error || banksRes.error || reportsRes.error);
  const assignments = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
  const banks = (banksRes.data ?? []) as unknown as BankRow[];
  const reports = (reportsRes.data ?? []) as unknown as ReportRow[];
  const groupTotals = Object.fromEntries(
    groupKeys.map((key, i) => [key, counts[i]?.count ?? 0])
  ) as Record<Group, number>;

  const banksToReview = banks.filter((bank) => bank.status === "awaiting_review");
  const failedAssignments = assignments.filter((a) => a.status === "failed").slice(0, 5);
  const statusLabel = (status: string) =>
    (ar.interviewBank.interviewStatuses as Record<string, string>)[status] ?? status;
  const bankLabel = (status: string) =>
    (ar.interviewBank.bankStatuses as Record<string, string>)[status] ?? status;

  const limit = billing?.limits.interviews;
  const quota = (
    <section aria-labelledby="quota-title" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 id="quota-title" className="text-sm font-semibold">
        {t.quota.title}
      </h2>
      {!billing ? (
        <p className="text-sm text-muted-foreground">{t.quota.unavailable}</p>
      ) : limit === 0 ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-[68ch] flex-col gap-1">
            <p className="text-sm font-medium">{t.quota.notIncluded}</p>
            <p className="text-sm text-muted-foreground">{t.quota.notIncludedHint}</p>
          </div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/billing" />}>
            <CreditCard className="size-4" aria-hidden />
            {t.quota.request}
          </Button>
        </div>
      ) : (
        <UsageMeter
          label={ar.billing.limits.interviews}
          used={billing.usage.interviews}
          limit={limit ?? null}
        />
      )}
    </section>
  );

  const overview = (
    <>
      {quota}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 xl:grid-cols-7">
        {groupKeys.map((key) => (
          <div key={key} className="flex flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{t.groups[key]}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              <bdi>{groupTotals[key]}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="attention-title" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="attention-title" className="border-b px-4 py-3 text-sm font-semibold">
          {t.attention}
        </h2>
        {banksToReview.length === 0 && failedAssignments.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">{t.attentionEmpty}</p>
        ) : (
          <ul className="divide-y">
            {banksToReview.map((bank) => (
              <li key={bank.id}>
                <Link
                  href={`/admin/jobs/${bank.job_id}/interview-bank`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-soft"
                >
                  <ClipboardCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{bank.jobs?.title}</span>
                  <Badge variant="default">{bankLabel(bank.status)}</Badge>
                </Link>
              </li>
            ))}
            {failedAssignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/applications/${a.application_id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-soft"
                >
                  <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {t.failedPlanning}: <span className="font-medium">{a.applications?.full_name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{a.applications?.jobs?.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );

  const interviewsTab =
    assignments.length === 0 ? (
      <Empty>{t.interviewsEmpty}</Empty>
    ) : (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t.columns.candidate}</th>
              <th className="hidden px-4 py-2 text-start font-medium md:table-cell">{t.columns.job}</th>
              <th className="px-4 py-2 text-start font-medium">{t.columns.status}</th>
              <th className="hidden px-4 py-2 text-start font-medium lg:table-cell">{t.columns.window}</th>
              <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t.columns.questions}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {assignments.map((a) => (
              <tr key={a.id} className="hover:bg-surface-soft">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/applications/${a.application_id}`} className="font-medium hover:text-primary">
                    {a.applications?.full_name ?? "—"}
                  </Link>
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                  {a.applications?.jobs?.title ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={a.status === "failed" ? "warning" : a.status === "evaluated" ? "success" : "secondary"}>
                    {statusLabel(a.status)}
                  </Badge>
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                  {a.opens_at && a.closes_at ? (
                    <bdi>
                      {formatDateTime(a.opens_at)} – {formatDateTime(a.closes_at)}
                    </bdi>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="hidden px-4 py-2.5 text-end text-muted-foreground sm:table-cell">
                  <bdi>{a.question_count ?? "—"}</bdi>
                  {a.duration_minutes ? (
                    <>
                      {" · "}
                      <bdi>{a.duration_minutes}</bdi> {t.minutes}
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const banksTab =
    banks.length === 0 ? (
      <Empty>{t.banksEmpty}</Empty>
    ) : (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t.banksColumns.job}</th>
              <th className="hidden px-4 py-2 text-start font-medium sm:table-cell">{t.banksColumns.version}</th>
              <th className="px-4 py-2 text-start font-medium">{t.banksColumns.status}</th>
              <th className="hidden px-4 py-2 text-start font-medium md:table-cell">{t.banksColumns.approved}</th>
              <th className="hidden px-4 py-2 text-start font-medium lg:table-cell">{t.banksColumns.lockedAt}</th>
              <th className="px-4 py-2">
                <span className="sr-only">{t.review}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {banks.map((bank) => (
              <tr key={bank.id} className="hover:bg-surface-soft">
                <td className="px-4 py-2.5 font-medium">{bank.jobs?.title ?? "—"}</td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                  <bdi>{bank.version}</bdi>
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      bank.status === "awaiting_review" ? "default" : bank.status === "failed" ? "warning" : "secondary"
                    }
                  >
                    {bankLabel(bank.status)}
                  </Badge>
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                  <bdi>
                    {bank.approved_count ?? 0} {ar.billing.meter.of} {bank.question_count ?? 0}
                  </bdi>
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                  {bank.locked_at ? <bdi>{formatDate(bank.locked_at)}</bdi> : "—"}
                </td>
                <td className="px-4 py-2.5 text-end">
                  <Link
                    href={`/admin/jobs/${bank.job_id}/interview-bank`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t.review}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const reportsTab =
    reports.length === 0 ? (
      <Empty>{t.reportsEmpty}</Empty>
    ) : (
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {reports.map((report) => {
          const assignment = report.interview_assignments;
          return (
            <li key={report.id}>
              <Link
                href={assignment ? `/admin/applications/${assignment.application_id}` : "#"}
                className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-surface-soft"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{assignment?.applications?.full_name ?? "—"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {assignment?.applications?.jobs?.title}
                  </span>
                </span>
                {report.overall_score !== null && (
                  <ScoreBadge score={report.overall_score} className="text-sm" />
                )}
                {report.confidence && (
                  <span className="text-xs text-muted-foreground">
                    {t.confidence[report.confidence] ?? report.confidence}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  <bdi>{formatDate(report.received_at)}</bdi>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">{t.title}</h1>
        {/* D30/§10.4: the stance is stated where the interviews are. */}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Scale className="size-4 text-primary" aria-hidden />
          {t.ethics}
        </p>
      </header>

      {failedLoad && (
        <Alert variant="destructive">
          <AlertDescription>{t.loadFailed}</AlertDescription>
        </Alert>
      )}

      <PageTabs
        initial={initial}
        tabs={[
          { value: "overview", label: t.tabs.overview, content: overview },
          { value: "interviews", label: t.tabs.interviews, content: interviewsTab },
          { value: "banks", label: t.tabs.banks, content: banksTab },
          { value: "reports", label: t.tabs.reports, content: reportsTab },
        ]}
      />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>
  );
}
