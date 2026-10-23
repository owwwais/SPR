import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/services/client";
import { AdvisoryBanner, StatusBadge } from "@/components/services/parts";
import {
  AdAuditResult,
  InterviewKitResult,
  JobNeedResult,
  OnboardingResult,
  PayGradeResult,
  TeamResult,
} from "@/components/services/results";
import { canAdminister, canWrite, requireMembership } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { SERVICE_ICONS, candidatePool, getPayGrades, getRun } from "@/lib/services";
import { isServiceKind } from "@/lib/validations/services";

export const metadata: Metadata = { title: ar.services.title };

// One run, read back exactly as hr-services stored it — no model call (§8).
// An output that fails its schema is not shown (D5).
export default async function ServiceRunPage({ params }: { params: Promise<{ kind: string; runId: string }> }) {
  const { kind, runId } = await params;
  if (!isServiceKind(kind)) notFound();
  const session = await requireMembership();
  const run = await getRun(session.org.id, runId);
  if (!run || run.kind !== kind) notFound();

  const t = ar.services;
  const Icon = SERVICE_ICONS[kind];
  const errorText = run.error ? ((t.errors as Record<string, string>)[run.error] ?? t.errors.server_error) : null;

  const [grades, pool] = await Promise.all([
    kind === "pay_grade" && run.status === "done" ? getPayGrades(session.org.id) : Promise.resolve(null),
    kind === "team" && run.status === "done" ? candidatePool(session.org.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex max-w-6xl flex-col gap-6 print:max-w-none">
      <Link
        href={`/admin/services/${kind}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowRight className="size-4" aria-hidden />
        {t.kinds[kind].title}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary print:hidden">
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold sm:text-2xl">{run.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t.kinds[kind].title}</span>
              <span aria-hidden>·</span>
              <span>{formatDateTime(run.created_at)}</span>
              <StatusBadge status={run.status} />
            </p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          {run.status === "done" && <PrintButton />}
          {canWrite(session.role) && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/services/${kind}`} />}>
              <RotateCcw className="size-4" aria-hidden />
              {t.newRun}
            </Button>
          )}
        </div>
      </div>

      {run.status === "processing" && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {t.running}
        </div>
      )}

      {run.status === "failed" && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{errorText ?? t.errors.server_error}</AlertDescription>
        </Alert>
      )}

      {run.status === "done" && (run.invalid || !run.output) && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{t.errors.invalid_output}</AlertDescription>
        </Alert>
      )}

      {run.status === "done" && run.output && (
        <>
          <AdvisoryBanner />
          {(run.extras.dropped ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {t.droppedNote} <bdi className="tabular-nums">{run.extras.dropped}</bdi>
            </p>
          )}
          {kind === "job_need" && <JobNeedResult run={run} canWrite={canWrite(session.role)} />}
          {kind === "pay_grade" && (
            <PayGradeResult run={run} grades={grades} canEdit={canAdminister(session.role)} />
          )}
          {kind === "team" && <TeamResult run={run} pool={pool} />}
          {kind === "ad_audit" && <AdAuditResult run={run} />}
          {kind === "interview_kit" && <InterviewKitResult run={run} />}
          {kind === "onboarding" && <OnboardingResult run={run} />}
          <p className="text-xs text-muted-foreground">
            {t.model}: <bdi dir="ltr">{run.model}</bdi> · {t.promptVersion}: <bdi dir="ltr">{run.prompt_version}</bdi>
          </p>
        </>
      )}
    </div>
  );
}
