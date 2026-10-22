import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileDown,
  Flag,
  Loader2,
  Maximize2,
  TriangleAlert,
} from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InterviewNotes, type InterviewQuestion } from "@/components/admin/interview-questions";
import { InterviewManager } from "@/components/admin/interview-manager";
import { RerunAnalysisButton } from "@/components/admin/rerun-analysis-button";
import { SaudizationControl } from "@/components/admin/saudization-control";
import { scoreBandClass } from "@/components/admin/score-badge";
import { StatusChanger } from "@/components/admin/status-changer";
import { VirtualInterviewPanel } from "@/components/admin/virtual-interview/virtual-interview-panel";
import { reRunAnalysis } from "@/app/(dashboard)/admin/applications/actions";
import { canWrite, requireMembership } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { loadVirtualInterview } from "@/lib/interviews";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BREAKDOWN_MAX, ExtractedCV, ScoreBreakdown } from "@/lib/validations/evaluation";
import { InterviewQa, ScreeningAnswers } from "@/lib/validations/screening";
import type { AppStatus } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Defensive re-validation of stored jsonb before display (§10.5) — data was
// zod-validated before persist, but never render anything that no longer
// parses.
const StoredEvaluation = z.object({
  fit_score: z.number().int().min(0).max(100),
  extracted: ExtractedCV,
  score_breakdown: ScoreBreakdown,
  justification: z.object({
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    red_flags: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  }),
  interview_questions: z.array(
    z.object({
      question: z.string(),
      kind: z.enum(["technical", "behavioral", "gap_probe"]),
      rationale: z.string(),
    })
  ),
});

type HistoryRow = {
  id: number;
  from_status: AppStatus | null;
  to_status: AppStatus;
  note: string | null;
  public_reason?: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
};

// UI-F5: the company never saw its own status history; only /track did.
// public_reason arrived in 0023, and the app deploys before migrations, so
// a database without the column still gets the history without it.
async function loadHistory(orgId: string, applicationId: string) {
  const supabase = await createClient();
  const base = "id, from_status, to_status, note, created_at, profiles(full_name)";
  const query = (columns: string) =>
    supabase
      .from("status_history")
      .select(columns)
      .eq("org_id", orgId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true })
      .limit(100);
  let res = await query(`${base}, public_reason`);
  if (res.error?.code === "42703") res = await query(base);
  if (res.error) {
    console.error("status history failed:", res.error.code, res.error.message);
    return null;
  }
  return (res.data ?? []) as unknown as HistoryRow[];
}

// The applicant, in one place (P4c): the advisory evidence first and the
// decision beside it (UI-F1), then the CV, the extracted profile, what they
// submitted, and the interview in a single section (UI-F11). Rendered by
// the full page and by the side panel over the applicants list.
export async function ApplicationDossier({
  id,
  variant,
}: {
  id: string;
  variant: "page" | "panel";
}) {
  const session = await requireMembership();
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select(
      "id, job_id, ref_code, full_name, email, phone, cv_path, cv_mime, cover_note, status, analysis_status, analysis_attempts, analysis_error, screening_answers, interview_at, interview_qa, counts_toward_saudization, via_account, created_at, jobs(title)"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!application) notFound();

  const screeningAnswers = (() => {
    const parsed = ScreeningAnswers.safeParse(application.screening_answers);
    return parsed.success ? parsed.data : [];
  })();
  const interviewQa = (() => {
    const parsed = InterviewQa.safeParse(application.interview_qa);
    return parsed.success ? parsed.data : [];
  })();
  const job = application.jobs as unknown as { title: string } | null;

  // Independent reads, in parallel: the signed CV link, the evaluation, the
  // virtual interview and the history each depend only on `application`.
  const [signedRes, evaluationRes, virtualInterview, history] = await Promise.all([
    // CV via short-lived signed URL only (D8): 10 minutes (§8).
    supabase.storage.from("cvs").createSignedUrl(application.cv_path, 600),
    application.analysis_status === "done"
      ? supabase
          .from("ai_evaluations")
          .select(
            "fit_score, extracted, score_breakdown, justification, interview_questions, interview_notes, model, prompt_version, blind, created_at"
          )
          .eq("application_id", id)
          .eq("org_id", session.org.id)
          .maybeSingle()
      : null,
    loadVirtualInterview({
      orgId: session.org.id,
      applicationId: application.id,
      jobId: application.job_id,
    }),
    loadHistory(session.org.id, application.id),
  ]);

  const cvUrl = signedRes.data?.signedUrl ?? null;
  const isPdf = application.cv_mime === "application/pdf";

  let evaluation: z.infer<typeof StoredEvaluation> | null = null;
  let evaluationMeta: {
    blind: boolean;
    model: string;
    prompt_version: string;
    created_at: string;
    interview_notes: string | null;
  } | null = null;
  if (evaluationRes) {
    const { data: row, error } = evaluationRes;
    if (error) {
      console.error("evaluation fetch failed:", error.message);
    } else if (row) {
      const parsed = StoredEvaluation.safeParse(row);
      if (parsed.success) {
        evaluation = parsed.data;
        evaluationMeta = {
          blind: row.blind,
          model: row.model,
          prompt_version: row.prompt_version,
          created_at: row.created_at,
          interview_notes: row.interview_notes,
        };
      } else {
        console.error("stored evaluation failed validation — not displayed");
      }
    }
  }

  const currentPath = `/admin/applications/${id}`;
  const rerun = reRunAnalysis.bind(null, id, currentPath);
  const writer = canWrite(session.role);
  const t = ar.evaluation;
  const s = ar.application.sections;

  return (
    <div className="@container flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {variant === "page" && (
          <Link
            href={`/admin/jobs/${application.job_id}/applicants`}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4" aria-hidden />
            {ar.application.backToApplicants}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {variant === "page" ? (
            <h1 className="text-xl font-bold">{application.full_name}</h1>
          ) : (
            <h2 className="text-xl font-bold">{application.full_name}</h2>
          )}
          <Badge variant="secondary">{ar.status[application.status]}</Badge>
          {/* D27: applied from a seeker account with the stored profile.
              The badge adds no data — the company sees exactly what the
              applicant chose to share in this application. */}
          {application.via_account && (
            <Badge variant="outline" title={ar.seekerPortal.admin.viaAccountHint}>
              {ar.seekerPortal.admin.viaAccountBadge}
              <span className="sr-only">
                {" — "}
                {ar.seekerPortal.admin.viaAccountHint}
              </span>
            </Badge>
          )}
          {variant === "panel" && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto"
              nativeButton={false}
              render={<a href={currentPath} />}
            >
              <Maximize2 className="size-3.5" aria-hidden />
              {ar.applicants.openFull}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span>
            {ar.application.appliedTo}:{" "}
            <Link
              href={`/admin/jobs/${application.job_id}/applicants`}
              className="text-foreground hover:underline"
            >
              {job?.title}
            </Link>
          </span>
          <span>
            {ar.application.appliedAt}: <bdi>{formatDate(application.created_at)}</bdi>
          </span>
          <span>
            {ar.application.refCode}:{" "}
            <bdi dir="ltr" className="rounded-sm bg-surface-soft px-1 font-mono text-xs">
              {application.ref_code}
            </bdi>
          </span>
        </div>
        <nav aria-label={ar.application.jump} className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
          {(
            [
              ["evaluation", s.evaluation],
              ["cv", s.cv],
              ["submission", s.submission],
              ["interview", s.interview],
              ["history", s.history],
            ] as const
          ).map(([anchor, label]) => (
            <a key={anchor} href={`#${anchor}`} className="text-primary hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------- التقييم الاستشاري ------------------------- */}
        <Section
          id="evaluation"
          title={s.evaluation}
          className="@4xl:col-start-1"
          actions={
            <>
              {evaluationMeta?.blind && <Badge variant="secondary">{ar.blindScreening.badge}</Badge>}
              {/* D24's evidence document: a plain GET that produces a file. */}
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`/admin/applications/${id}/transparency`} download />}
              >
                <FileDown className="size-4" aria-hidden />
                {ar.transparency.export}
              </Button>
            </>
          }
        >
          {/* §10.4: the advisory framing is always visible. */}
          <p className="text-sm text-muted-foreground">{t.advisoryDisclaimer}</p>

          {(application.analysis_status === "pending" ||
            application.analysis_status === "processing") && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              {application.analysis_status === "pending" ? t.pendingAnalysis : t.processingAnalysis}
            </div>
          )}

          {application.analysis_status === "failed" && (
            <div className="flex flex-col gap-3">
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>
                  {t.failedAnalysis} ({t.attempts}: <bdi>{application.analysis_attempts}</bdi>)
                </AlertDescription>
              </Alert>
              {writer && (
                <div>
                  <RerunAnalysisButton action={rerun} variant="outline" />
                </div>
              )}
            </div>
          )}

          {application.analysis_status === "done" && !evaluation && (
            <p className="text-sm text-muted-foreground">{t.unavailable}</p>
          )}

          {evaluation && evaluationMeta && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <span
                  title={t.advisoryTooltip}
                  className={`inline-flex items-baseline gap-2 rounded-xl px-4 py-2 text-3xl font-bold tabular-nums ${scoreBandClass(evaluation.fit_score)}`}
                >
                  {evaluation.fit_score}
                  <span className="text-xs font-medium">{t.advisory}</span>
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{t.fitScore}</span>
                  {evaluation.justification.confidence === "low" && (
                    <Badge variant="warning">
                      <TriangleAlert aria-hidden />
                      {t.confidenceLow}
                    </Badge>
                  )}
                </div>
                {writer && (
                  <div className="ms-auto">
                    <RerunAnalysisButton action={rerun} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t.scoreBreakdown}</h3>
                {(Object.keys(BREAKDOWN_MAX) as Array<keyof typeof BREAKDOWN_MAX>).map((key) => {
                  const value = evaluation.score_breakdown[key];
                  const max = BREAKDOWN_MAX[key];
                  return (
                    // Narrow (a phone, the panel): label and value over a
                    // full-width bar. Wide: label | bar | value on one line.
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @xl:grid-cols-[9rem_minmax(0,1fr)_4.5rem]"
                    >
                      <span className="text-sm">{t.criteria[key]}</span>
                      <bdi className="text-end text-sm tabular-nums text-muted-foreground @xl:order-last">
                        {value} {ar.billing.meter.of} {max}
                      </bdi>
                      <div className="col-span-2 h-1.5 overflow-hidden rounded-sm bg-surface-sunken @xl:col-span-1">
                        <div
                          className="h-full rounded-sm bg-primary"
                          style={{ width: `${(value / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-5 border-t pt-5 @2xl:grid-cols-3">
                <JustificationList
                  title={t.strengths}
                  items={evaluation.justification.strengths}
                  icon={<CircleCheck className="size-4 shrink-0 text-success" aria-hidden />}
                />
                <JustificationList
                  title={t.gaps}
                  items={evaluation.justification.gaps}
                  icon={<CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
                />
                <JustificationList
                  title={t.redFlags}
                  items={evaluation.justification.red_flags}
                  icon={<Flag className="size-4 shrink-0 text-destructive" aria-hidden />}
                />
              </div>

              <p className="border-t pt-3 text-xs text-muted-foreground">
                {t.meta
                  .replace("{model}", evaluationMeta.model)
                  .replace("{version}", evaluationMeta.prompt_version)}{" "}
                — <bdi>{formatDateTime(evaluationMeta.created_at)}</bdi>
              </p>
            </>
          )}
        </Section>

        {/* ------------------------------ القرار ------------------------------ */}
        {/* Second in the source so a phone reaches it right after the
            evidence; beside everything else from @4xl up. */}
        <aside className="flex flex-col gap-4 @4xl:sticky @4xl:top-16 @4xl:col-start-2 @4xl:row-span-6 @4xl:row-start-1">
          <section
            aria-labelledby="decision-title"
            className="flex flex-col gap-4 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="decision-title" className="text-sm font-semibold">
                {s.decision}
              </h2>
              <Badge variant="secondary">{ar.status[application.status]}</Badge>
            </div>
            {writer ? (
              <StatusChanger applicationId={application.id} currentStatus={application.status} />
            ) : (
              <p className="text-sm text-muted-foreground">{ar.application.currentStatus}: {ar.status[application.status]}</p>
            )}
            {/* Only once the candidate is actually being hired. Asking
                earlier would put a nationality question next to a CV that
                is still being evaluated, which is exactly the adjacency the
                fairness rules exist to prevent. */}
            {writer && (application.status === "interview" || application.status === "accepted") && (
              <div className="border-t pt-4">
                <SaudizationControl
                  applicationId={application.id}
                  value={application.counts_toward_saudization}
                />
              </div>
            )}
          </section>

          <section
            id="history"
            aria-labelledby="history-title"
            className="flex scroll-mt-16 flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <h2 id="history-title" className="text-sm font-semibold">
              {s.history}
            </h2>
            <StatusHistory rows={history} />
          </section>

          <section
            aria-labelledby="contact-title"
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm"
          >
            <h2 id="contact-title" className="text-sm font-semibold">
              {s.contact}
            </h2>
            <a dir="ltr" href={`mailto:${application.email}`} className="truncate text-start text-primary hover:underline">
              {application.email}
            </a>
            <a dir="ltr" href={`tel:${application.phone}`} className="text-start text-primary hover:underline">
              {application.phone}
            </a>
          </section>
        </aside>

        {/* ---------------------------- السيرة الذاتية ---------------------------- */}
        <Section
          id="cv"
          title={s.cv}
          className="@4xl:col-start-1"
          actions={
            cvUrl ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={cvUrl} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink className="size-4" aria-hidden />
                {ar.application.openCv}
              </Button>
            ) : null
          }
        >
          {!cvUrl ? (
            <p className="text-sm text-destructive">{ar.application.cvUnavailable}</p>
          ) : isPdf ? (
            <>
              <iframe
                src={cvUrl}
                title={ar.application.cvPreview}
                loading="lazy"
                className="h-[70vh] min-h-96 w-full rounded-md border bg-surface-soft"
              />
              <p className="text-xs text-muted-foreground">{ar.application.cvLinkNote}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{ar.application.cvDocx}</p>
          )}
        </Section>

        {evaluation && (
          <Section id="extracted" title={s.extracted} className="@4xl:col-start-1">
            <ExtractedProfile extracted={evaluation.extracted} />
          </Section>
        )}

        {/* ---------------------------- بيانات التقديم ---------------------------- */}
        <Section id="submission" title={s.submission} className="@4xl:col-start-1">
          {application.cover_note ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{ar.application.coverNote}</h3>
              <p className="max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-body">
                {application.cover_note}
              </p>
            </div>
          ) : null}
          {screeningAnswers.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
              <h3 className="text-sm font-semibold">{ar.application.screeningTitle}</h3>
              <dl className="flex flex-col gap-3">
                {screeningAnswers.map((entry) => {
                  // #11: a flag for HR's attention only — never an
                  // auto-reject (D4). "لا" is the literal value yes_no
                  // answers are stored as (apply-form.tsx), not a code.
                  const flagged = entry.disqualifying && entry.answer === "لا";
                  return (
                    <div key={entry.question_id} className="text-sm">
                      <dt className="flex items-center gap-1.5 font-medium">
                        {entry.label}
                        {flagged && (
                          <Badge variant="warning">
                            <TriangleAlert aria-hidden />
                            {ar.application.screeningFlag}
                          </Badge>
                        )}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                        {Array.isArray(entry.answer) ? entry.answer.join("، ") : entry.answer}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
          {!application.cover_note && screeningAnswers.length === 0 && (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Section>

        {/* ------------------------------ المقابلة ----------------------------- */}
        <Section id="interview" title={s.interview} className="@4xl:col-start-1">
          <VirtualInterviewPanel
            applicationId={application.id}
            jobId={application.job_id}
            analysisDone={application.analysis_status === "done"}
            canEdit={writer}
            data={virtualInterview}
          />
          <div className="flex flex-col gap-5 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              {application.interview_at ? (
                <>
                  {ar.interview.scheduleLabel}: <bdi>{formatDateTime(application.interview_at)}</bdi>
                </>
              ) : (
                ar.interview.notScheduled
              )}
            </p>
            {writer && (
              <InterviewManager
                applicationId={id}
                aiQuestions={(evaluation?.interview_questions ?? []) as InterviewQuestion[]}
                initialQa={interviewQa}
                initialAt={application.interview_at}
              />
            )}
            {writer && evaluationMeta && (
              <div className="border-t pt-5">
                <InterviewNotes
                  applicationId={id}
                  initialNotes={evaluationMeta.interview_notes ?? ""}
                />
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("flex min-w-0 scroll-mt-16 flex-col rounded-xl border bg-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex flex-col gap-5 p-5">{children}</div>
    </section>
  );
}

function StatusHistory({ rows }: { rows: HistoryRow[] | null }) {
  const h = ar.application.history;
  if (rows === null) return <p className="text-sm text-muted-foreground">{h.unavailable}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{h.empty}</p>;

  const reasons = ar.application.statusChange.reasons as Record<string, string>;
  return (
    <ol className="flex flex-col">
      {rows.map((row, index) => (
        <li key={row.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < rows.length - 1 && (
            <span aria-hidden className="absolute start-[0.3125rem] top-3 bottom-0 w-px bg-border" />
          )}
          <span
            aria-hidden
            className={cn(
              "relative mt-1.5 size-2.5 shrink-0 rounded-full border-2",
              index === rows.length - 1 ? "border-primary bg-primary" : "border-input bg-card"
            )}
          />
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="font-medium">
              {row.from_status === null ? h.submitted : ar.status[row.to_status]}
            </span>
            <span className="text-xs text-muted-foreground">
              <bdi>{formatDateTime(row.created_at)}</bdi>
              {" · "}
              {row.profiles?.full_name ?? h.system}
            </span>
            {row.note && <p className="whitespace-pre-wrap text-xs text-body">{row.note}</p>}
            {row.public_reason && (
              <p className="text-xs text-muted-foreground">
                {h.publicReason}: {reasons[row.public_reason] ?? row.public_reason}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function JustificationList({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">{icon}</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExtractedProfile({ extracted }: { extracted: z.infer<typeof ExtractedCV> }) {
  const t = ar.evaluation;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span>
          {t.totalYears}:{" "}
          <strong className="tabular-nums">{extracted.total_years_experience}</strong> {t.yearsUnit}
        </span>
        <span>
          {t.cvLanguage}: {t.cvLanguages[extracted.cv_language]}
        </span>
      </div>

      {extracted.experiences.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.experiencesTitle}</h3>
          <ol className="flex flex-col gap-3 border-s-2 ps-4">
            {extracted.experiences.map((exp, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {exp.title}
                  {exp.company && <span className="text-muted-foreground"> — {exp.company}</span>}
                </span>
                <bdi dir="ltr" className="text-start text-xs text-muted-foreground">
                  {exp.start ?? "؟"} → {exp.end ?? t.present}
                </bdi>
                <p className="text-sm text-muted-foreground">{exp.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {extracted.education.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.educationTitle}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {extracted.education.map((edu, i) => (
              <li key={i}>
                {edu.degree}
                {edu.field && ` — ${edu.field}`}
                {edu.institution && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({edu.institution}
                    {edu.year && `، ${edu.year}`})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        {extracted.skills.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.skillsTitle}</h3>
            <div className="flex flex-wrap gap-1.5">
              {extracted.skills.map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {extracted.languages.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.languagesTitle}</h3>
            <div className="flex flex-wrap gap-1.5">
              {extracted.languages.map((lang) => (
                <Badge key={lang} variant="secondary">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
