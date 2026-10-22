import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  Hourglass,
  ListChecks,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireMembership } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: ar.today.title,
};

type Today = {
  counts: { new: number; this_week: number; analyzing: number; published_jobs: number };
  new_by_job: {
    job_id: string;
    title: string;
    new_count: number;
    top: { id: string; full_name: string; fit_score: number | null }[];
  }[];
  failed: {
    count: number;
    items: { id: string; full_name: string; job_title: string; attempts: number }[];
  };
  interviews: { id: string; full_name: string; job_title: string; interview_at: string }[];
  reports: { application_id: string; full_name: string; job_title: string; received_at: string }[];
  banks_to_review: { job_id: string; title: string; question_count: number }[];
  closing_soon: { job_id: string; title: string; closes_at: string }[];
  quiet_jobs: { job_id: string; title: string; created_at: string }[];
  first_steps: Record<string, boolean>;
};

const rowLink =
  "flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none";

// Before 0026 is applied the page still answers with the basic counts, from
// the same queries the old home page ran (the deploy-order rule).
async function fallbackCounts(orgId: string) {
  const supabase = await createClient();
  const [news, published, analyzing] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "new"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "published").is("deleted_at", null),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("analysis_status", ["pending", "processing"]),
  ]);
  return {
    new: news.count ?? 0,
    this_week: null,
    analyzing: analyzing.count ?? 0,
    published_jobs: published.count ?? 0,
  };
}

export default async function TodayPage() {
  const session = await requireMembership();
  const supabase = await createClient();
  const t = ar.today;

  const { data, error } = await supabase.rpc("workspace_today", { p_org: session.org.id });
  if (error) console.error("workspace_today failed:", error.code, error.message);
  const today = error ? null : (data as Today);
  const counts = today?.counts ?? (await fallbackCounts(session.org.id));

  const steps = today
    ? t.firstSteps.items.filter((item) => !today.first_steps[item.key])
    : [];
  const attentionCount = (today?.closing_soon.length ?? 0) + (today?.quiet_jobs.length ?? 0);
  const nothingPending =
    today !== null &&
    today.new_by_job.length === 0 &&
    today.failed.count === 0 &&
    today.interviews.length === 0 &&
    today.reports.length === 0 &&
    today.banks_to_review.length === 0 &&
    attentionCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.greeting}، {session.fullName} · {formatDate(new Date().toISOString())}
        </p>
      </header>

      {!today && <p className="text-sm text-muted-foreground">{t.unavailable}</p>}

      {/* One line of facts, hairlines between them — not four cards. */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-4">
        {(
          [
            [t.counts.new, counts.new],
            [t.counts.thisWeek, counts.this_week],
            [t.counts.analyzing, counts.analyzing],
            [t.counts.publishedJobs, counts.published_jobs],
          ] as const
        ).map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "flex flex-col gap-0.5 px-4 py-3",
              index % 2 === 1 && "border-s",
              index >= 2 && "border-t sm:border-t-0",
              index === 2 && "sm:border-s"
            )}
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              <bdi>{value ?? "—"}</bdi>
            </dd>
          </div>
        ))}
      </dl>

      {steps.length > 0 && (
        <section aria-labelledby="first-steps" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <h2 id="first-steps" className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-primary" aria-hidden />
            {t.firstSteps.title}
          </h2>
          <ol className="grid gap-2 sm:grid-cols-2">
            {t.firstSteps.items.map((item) => {
              const done = today?.first_steps[item.key] === true;
              const body = (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      done ? "border-success bg-success-soft text-success" : "border-input"
                    )}
                  >
                    {done && <Check className="size-3" />}
                  </span>
                  <span className={done ? "text-muted-foreground line-through" : undefined}>
                    {item.label}
                  </span>
                  {done && <span className="sr-only">{t.firstSteps.done}</span>}
                </>
              );
              return (
                <li key={item.key}>
                  {item.href && !done ? (
                    <Link href={item.href} className="flex items-center gap-2.5 rounded-md text-sm hover:text-primary">
                      {body}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2.5 text-sm">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {nothingPending && steps.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t.allClear}
        </p>
      )}

      {today && !nothingPending && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Section
              id="review"
              icon={UserRoundSearch}
              title={t.review.title}
              count={counts.new}
              hint={t.review.hint}
            >
              {today.new_by_job.length === 0 ? (
                <Empty>{t.review.empty}</Empty>
              ) : (
                <ul className="divide-y">
                  {today.new_by_job.map((job) => (
                    <li key={job.job_id} className="flex flex-col">
                      <Link
                        href={`/admin/jobs/${job.job_id}/applicants?status=new`}
                        className={cn(rowLink, "font-medium")}
                      >
                        <span className="min-w-0 flex-1 truncate">{job.title}</span>
                        <span className="rounded-sm bg-primary-soft px-1.5 text-xs font-semibold text-primary-soft-foreground tabular-nums">
                          <bdi>{job.new_count}</bdi>
                        </span>
                        <ChevronLeft className="size-4 text-muted-soft" aria-hidden />
                      </Link>
                      <ul className="pb-2">
                        {job.top.map((applicant) => (
                          <li key={applicant.id}>
                            <Link
                              href={`/admin/applications/${applicant.id}`}
                              className="flex min-h-10 items-center gap-3 py-1.5 ps-8 pe-4 text-sm text-body transition-colors hover:bg-surface-soft"
                            >
                              <span className="min-w-0 flex-1 truncate">{applicant.full_name}</span>
                              {applicant.fit_score === null ? (
                                <span className="text-xs text-muted-foreground">{t.review.noScore}</span>
                              ) : (
                                <ScoreBadge score={applicant.fit_score} className="text-sm" />
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {today.failed.count > 0 && (
              <Section
                id="failed"
                icon={AlertTriangle}
                tone="warning"
                title={t.failed.title}
                count={today.failed.count}
                hint={t.failed.hint}
              >
                <ul className="divide-y">
                  {today.failed.items.map((item) => (
                    <li key={item.id}>
                      <Link href={`/admin/applications/${item.id}`} className={rowLink}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.full_name}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.job_title}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          <bdi>{item.attempts}</bdi> {t.failed.attempts}
                        </span>
                        <span className="text-xs font-medium text-primary">{t.failed.open}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Section
              id="interviews"
              icon={CalendarClock}
              title={t.interviews.title}
              count={today.interviews.length}
              action={{ href: "/admin/calendar", label: t.interviews.calendar }}
            >
              {today.interviews.length === 0 ? (
                <Empty>{t.interviews.empty}</Empty>
              ) : (
                <ul className="divide-y">
                  {today.interviews.map((item) => (
                    <li key={item.id}>
                      <Link href={`/admin/applications/${item.id}`} className={rowLink}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.full_name}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.job_title}</span>
                        </span>
                        <span className="shrink-0 text-xs text-body tabular-nums">
                          <bdi>{formatDateTime(item.interview_at)}</bdi>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {today.reports.length > 0 && (
              <Section id="reports" icon={FileText} title={t.reports.title} count={today.reports.length}>
                <ul className="divide-y">
                  {today.reports.map((item) => (
                    <li key={`${item.application_id}-${item.received_at}`}>
                      <Link href={`/admin/applications/${item.application_id}`} className={rowLink}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.full_name}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.job_title}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          <bdi>{formatDate(item.received_at)}</bdi>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {today.banks_to_review.length > 0 && (
              <Section
                id="banks"
                icon={ClipboardCheck}
                title={t.banks.title}
                count={today.banks_to_review.length}
                hint={t.banks.hint}
              >
                <ul className="divide-y">
                  {today.banks_to_review.map((bank) => (
                    <li key={bank.job_id}>
                      <Link href={`/admin/jobs/${bank.job_id}/interview-bank`} className={rowLink}>
                        <span className="min-w-0 flex-1 truncate font-medium">{bank.title}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          <bdi>{bank.question_count}</bdi> {t.banks.questions}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {attentionCount > 0 && (
              <Section id="attention" icon={Hourglass} title={t.attention.title} count={attentionCount}>
                <ul className="divide-y">
                  {today.closing_soon.map((job) => (
                    <li key={`c-${job.job_id}`}>
                      <Link href={`/admin/jobs/${job.job_id}/edit`} className={rowLink}>
                        <span className="min-w-0 flex-1 truncate font-medium">{job.title}</span>
                        <span className="shrink-0 text-xs text-warning">
                          {t.attention.closesOn} <bdi>{formatDate(job.closes_at)}</bdi>
                        </span>
                      </Link>
                    </li>
                  ))}
                  {today.quiet_jobs.map((job) => (
                    <li key={`q-${job.job_id}`}>
                      <Link href={`/admin/jobs/${job.job_id}/edit`} className={rowLink}>
                        <span className="min-w-0 flex-1 truncate font-medium">{job.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{t.attention.quiet}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  count,
  hint,
  tone,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number;
  hint?: string;
  tone?: "warning";
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`today-${id}`} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-primary")}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={`today-${id}`} className="flex items-baseline gap-2 text-sm font-semibold">
            {title}
            {count !== undefined && (
              <span className="font-normal text-muted-foreground tabular-nums">
                <bdi>{count}</bdi>
              </span>
            )}
          </h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action && (
          <Link href={action.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}
