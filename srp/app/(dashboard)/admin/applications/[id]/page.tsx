import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Flag,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InterviewQuestions,
  type InterviewQuestion,
} from "@/components/admin/interview-questions";
import { StatusChanger } from "@/components/admin/status-changer";
import { scoreBandClass } from "@/components/admin/score-badge";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ExtractedCV, ScoreBreakdown } from "@/lib/validations/evaluation";
import { ar } from "@/lib/i18n/ar";
import { formatDate, formatDateTime } from "@/lib/format";
import { reRunAnalysis } from "../actions";

export const metadata: Metadata = {
  title: ar.application.title,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const BREAKDOWN_MAX = {
  required_skills: 40,
  experience_relevance: 30,
  experience_years: 15,
  education_fit: 10,
  bonus_signals: 5,
} as const;

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select(
      "id, job_id, ref_code, full_name, email, phone, cv_path, cover_note, status, analysis_status, analysis_attempts, created_at, jobs(title)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!application) notFound();

  const job = application.jobs as unknown as { title: string } | null;

  // CV via short-lived signed URL only (D8): 10 minutes (§8).
  const { data: signed } = await supabase.storage
    .from("cvs")
    .createSignedUrl(application.cv_path, 600);
  const cvUrl = signed?.signedUrl ?? null;

  // Evaluation is fetched separately and only when analysis completed.
  let evaluation: z.infer<typeof StoredEvaluation> | null = null;
  let evaluationMeta: {
    model: string;
    prompt_version: string;
    created_at: string;
    interview_notes: string | null;
  } | null = null;
  if (application.analysis_status === "done") {
    const { data: row, error } = await supabase
      .from("ai_evaluations")
      .select(
        "fit_score, extracted, score_breakdown, justification, interview_questions, interview_notes, model, prompt_version, created_at"
      )
      .eq("application_id", id)
      .maybeSingle();
    if (error) {
      console.error("evaluation fetch failed:", error.message);
    } else if (row) {
      const parsed = StoredEvaluation.safeParse(row);
      if (parsed.success) {
        evaluation = parsed.data;
        evaluationMeta = {
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
  const t = ar.evaluation;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={`/admin/jobs/${application.job_id}/applicants`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {ar.application.backToApplicants}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{application.full_name}</h1>
          <Badge variant="secondary">{ar.status[application.status]}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
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
            {ar.application.appliedAt}: {formatDate(application.created_at)}
          </span>
          <span>
            {ar.application.refCode}:{" "}
            <code dir="ltr" className="rounded bg-muted px-1 font-mono text-xs">
              {application.ref_code}
            </code>
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>
              {ar.application.email}:{" "}
              <a
                dir="ltr"
                href={`mailto:${application.email}`}
                className="text-primary hover:underline"
              >
                {application.email}
              </a>
            </span>
            <span>
              {ar.application.phone}:{" "}
              <a
                dir="ltr"
                href={`tel:${application.phone}`}
                className="text-primary hover:underline"
              >
                {application.phone}
              </a>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {cvUrl ? (
              <>
                <Button
                  nativeButton={false}
                  render={
                    <a href={cvUrl} target="_blank" rel="noopener noreferrer" />
                  }
                >
                  <ExternalLink className="size-4" aria-hidden />
                  {ar.application.viewCv}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {ar.application.cvLinkNote}
                </span>
              </>
            ) : (
              <span className="text-sm text-destructive">
                {ar.application.cvUnavailable}
              </span>
            )}
          </div>
          {application.cover_note && (
            <div className="rounded-lg bg-muted/50 p-4">
              <h3 className="mb-1 text-sm font-semibold">
                {ar.application.coverNote}
              </h3>
              <p className="whitespace-pre-wrap text-sm">
                {application.cover_note}
              </p>
            </div>
          )}
          <div className="border-t pt-4">
            <StatusChanger
              applicationId={application.id}
              currentStatus={application.status}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.sectionTitle}</CardTitle>
          {/* §10.4: the advisory framing must always be visible. */}
          <p className="text-sm text-muted-foreground">
            {t.advisoryDisclaimer}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {(application.analysis_status === "pending" ||
            application.analysis_status === "processing") && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              {application.analysis_status === "pending"
                ? t.pendingAnalysis
                : t.processingAnalysis}
            </div>
          )}

          {application.analysis_status === "failed" && (
            <div className="flex flex-col gap-3">
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>
                  {t.failedAnalysis} ({t.attempts}:{" "}
                  {application.analysis_attempts})
                </AlertDescription>
              </Alert>
              <form action={reRunAnalysis.bind(null, id, currentPath)}>
                <Button type="submit" variant="outline">
                  <RefreshCw className="size-4" aria-hidden />
                  {t.retry}
                </Button>
              </form>
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
                    <Badge
                      variant="outline"
                      className="border-amber-500 text-amber-700 dark:text-amber-400"
                    >
                      <TriangleAlert className="size-3" aria-hidden />
                      {t.confidenceLow}
                    </Badge>
                  )}
                </div>
                <form
                  action={reRunAnalysis.bind(null, id, currentPath)}
                  className="ms-auto"
                >
                  <Button type="submit" variant="ghost" size="sm">
                    <RefreshCw className="size-3.5" aria-hidden />
                    {t.retry}
                  </Button>
                </form>
              </div>

              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">{t.scoreBreakdown}</h3>
                <div className="flex flex-col gap-2">
                  {(
                    Object.keys(BREAKDOWN_MAX) as Array<
                      keyof typeof BREAKDOWN_MAX
                    >
                  ).map((key) => {
                    const value = evaluation.score_breakdown[key];
                    const max = BREAKDOWN_MAX[key];
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-sm">
                          {t.criteria[key]}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(value / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-end text-sm tabular-nums text-muted-foreground">
                          {value} / {max}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-3">
                <JustificationList
                  title={t.strengths}
                  items={evaluation.justification.strengths}
                  icon={
                    <CircleCheck
                      className="size-4 shrink-0 text-emerald-600"
                      aria-hidden
                    />
                  }
                />
                <JustificationList
                  title={t.gaps}
                  items={evaluation.justification.gaps}
                  icon={
                    <CircleAlert
                      className="size-4 shrink-0 text-amber-600"
                      aria-hidden
                    />
                  }
                />
                <JustificationList
                  title={t.redFlags}
                  items={evaluation.justification.red_flags}
                  icon={
                    <Flag className="size-4 shrink-0 text-red-600" aria-hidden />
                  }
                />
              </section>

              <ExtractedProfile extracted={evaluation.extracted} />

              <InterviewQuestions
                applicationId={id}
                questions={evaluation.interview_questions as InterviewQuestion[]}
                initialNotes={evaluationMeta.interview_notes ?? ""}
              />

              <p className="border-t pt-3 text-xs text-muted-foreground">
                {t.meta
                  .replace("{model}", evaluationMeta.model)
                  .replace("{version}", evaluationMeta.prompt_version)}{" "}
                — {formatDateTime(evaluationMeta.created_at)}
              </p>
            </>
          )}
        </CardContent>
      </Card>

    </div>
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
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
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

function ExtractedProfile({
  extracted,
}: {
  extracted: import("zod").infer<typeof ExtractedCV>;
}) {
  const t = ar.evaluation;
  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-semibold">{t.extractedTitle}</h3>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span>
          {t.totalYears}:{" "}
          <strong className="tabular-nums">
            {extracted.total_years_experience}
          </strong>{" "}
          {t.yearsUnit}
        </span>
        <span>
          {t.cvLanguage}: {t.cvLanguages[extracted.cv_language]}
        </span>
      </div>

      {extracted.experiences.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t.experiencesTitle}
          </h4>
          <ol className="flex flex-col gap-3 border-s-2 ps-4">
            {extracted.experiences.map((exp, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {exp.title}
                  {exp.company && (
                    <span className="text-muted-foreground"> — {exp.company}</span>
                  )}
                </span>
                <span dir="ltr" className="text-xs text-muted-foreground">
                  {exp.start ?? "؟"} ← {exp.end ?? t.present}
                </span>
                <p className="text-sm text-muted-foreground">{exp.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {extracted.education.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t.educationTitle}
          </h4>
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
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
              {t.skillsTitle}
            </h4>
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
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
              {t.languagesTitle}
            </h4>
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
    </section>
  );
}
