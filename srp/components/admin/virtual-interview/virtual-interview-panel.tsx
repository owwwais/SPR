import Link from "next/link";
import { AlertCircle, ArrowLeft, Info, Loader2, Lock, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRefresh } from "@/components/admin/interview-bank/auto-refresh";
import { QuestionList } from "@/components/admin/interview-bank/question-list";
import { fill, shortHash } from "@/components/admin/interview-bank/helpers";
import {
  fetchInterviewBank,
  interviewErrorMessage,
  type AssignmentSummary,
  type GatewayInterview,
  type QuestionKind,
  type StoredInterviewConfig,
  type VirtualInterviewData,
} from "@/lib/interviews";
import { formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import type { InterviewStatus } from "@/types/database";
import { InterviewConfigForm } from "./interview-config-form";
import { CancelInterviewButton, LockInterviewButton } from "./interview-buttons";

// A cancelled, expired or failed interview may be followed by a new one
// (interview_assignments_one_live allows it).
const ENDED: InterviewStatus[] = ["cancelled", "expired", "failed"];
// Statuses in which the agent knows more than the stored row: gap probes
// under review, and a status or lock the webhook may not have delivered yet.
const ASK_AGENT: InterviewStatus[] = ["draft", "planning", "awaiting_review"];
// Where a cancel is still possible on the agent (its state machine).
const CANCELLABLE: InterviewStatus[] = [
  "draft",
  "planning",
  "awaiting_review",
  "scheduled",
  "open",
  "in_progress",
];

// «المقابلة الافتراضية» on the applicant page (I1). Data comes from
// loadVirtualInterview() in the page (explicit org filters); the agent is
// asked only for what it alone holds. There is no score at this stage, and
// nothing here ever touches the application's status (D30).
export async function VirtualInterviewPanel({
  applicationId,
  jobId,
  analysisDone,
  canEdit,
  data,
}: {
  applicationId: string;
  jobId: string;
  analysisDone: boolean;
  canEdit: boolean;
  data: VirtualInterviewData;
}) {
  const t = ar.interviewBank.panel;
  const { assignment } = data;

  let view: GatewayInterview | null = null;
  let loadError: string | null = null;
  if (
    assignment &&
    !assignment.stale &&
    assignment.external_interview_id &&
    !assignment.bank_locked_at &&
    ASK_AGENT.includes(assignment.status)
  ) {
    const result = await fetchInterviewBank(assignment.id);
    if (result.ok) view = result.data;
    else loadError = interviewErrorMessage(result.code);
  }

  const status: InterviewStatus | null = view?.status ?? assignment?.status ?? null;
  const live =
    assignment !== null && status !== null && !assignment.stale && !ENDED.includes(status);
  const config = assignment?.config ?? null;
  // Locked but not yet sent (dispatch arrives with I2): the agent still says
  // awaiting_review, and showing that beside «الأسئلة مقفلة» would claim a
  // review that is already done.
  const questionsLocked = Boolean(view?.locked_at ?? assignment?.bank_locked_at);
  const statusLabel =
    status === "awaiting_review" && questionsLocked
      ? t.locked.badge
      : status
        ? ar.interviewBank.interviewStatuses[status]
        : null;

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          {live && status && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {config && (
                <span className="tabular-nums">
                  {fill(t.summary, {
                    count: config.question_count,
                    minutes: config.duration_minutes,
                  })}
                </span>
              )}
              <Badge variant="secondary">{statusLabel}</Badge>
            </div>
          )}
        </div>
        <p className="max-w-[68ch] text-sm text-muted-foreground">{t.intro}</p>

        {loadError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {live && assignment && status ? (
          <LiveInterview
            assignment={assignment}
            status={status}
            view={view}
            config={config}
            canEdit={canEdit}
          />
        ) : (
          <StartSection
            applicationId={applicationId}
            jobId={jobId}
            analysisDone={analysisDone}
            canEdit={canEdit}
            data={data}
            previousStatus={assignment ? status : null}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LiveInterview({
  assignment,
  status,
  view,
  config,
  canEdit,
}: {
  assignment: AssignmentSummary;
  status: InterviewStatus;
  view: GatewayInterview | null;
  config: StoredInterviewConfig | null;
  canEdit: boolean;
}) {
  const t = ar.interviewBank.panel;
  const lockedAt = view?.locked_at ?? assignment.bank_locked_at;
  const planHash = view?.plan_hash ?? assignment.bank_hash;
  const cancel =
    canEdit && CANCELLABLE.includes(status) ? (
      <CancelInterviewButton assignmentId={assignment.id} />
    ) : null;

  if (lockedAt) {
    const counts = planCounts(view?.plan ?? null, config);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-success" aria-hidden />
          <h3 className="font-semibold">{t.locked.title}</h3>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          {counts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <dt className="text-muted-foreground">{t.locked.counts}:</dt>
              {counts.map((entry) => (
                <dd key={entry.label}>
                  <Badge variant="outline" className="tabular-nums">
                    {entry.label} {entry.n}
                  </Badge>
                </dd>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t.locked.hash}:</dt>
            <dd>
              <code
                dir="ltr"
                title={planHash ?? undefined}
                className="rounded bg-muted px-1 font-mono text-xs"
              >
                {shortHash(planHash)}
              </code>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t.locked.lockedAt}:</dt>
            <dd>{formatDateTime(lockedAt)}</dd>
          </div>
        </dl>
        <div className="flex flex-col items-start gap-2 border-t pt-4">
          {/* Honest about the milestone: sending arrives with the room (I2). */}
          <Button type="button" disabled>
            <Send aria-hidden />
            {t.locked.send}
          </Button>
          <p className="text-sm text-muted-foreground">{t.locked.sendNote}</p>
        </div>
        {cancel}
      </div>
    );
  }

  if (status === "draft" || status === "planning") {
    const copy = status === "draft" && !assignment.external_interview_id ? t.sending : t.planning;
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex items-start gap-3 rounded-lg border border-dashed p-5">
          <Loader2
            className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <span className="font-medium">{copy.title}</span>
            <span className="text-sm text-muted-foreground">{copy.body}</span>
          </div>
        </div>
        <AutoRefresh />
        {cancel}
      </div>
    );
  }

  if (status === "awaiting_review") {
    if (!view) return cancel;
    const need = config?.mix.gap_probe ?? 0;
    const usable = view.gap_probes.filter((q) => q.status !== "removed").length;
    const short = usable < need;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">{t.review.title}</h3>
          {view.gap_probes.length > 0 && (
            <p className="max-w-[68ch] text-sm text-muted-foreground">{t.review.hint}</p>
          )}
        </div>
        {view.gap_probes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.review.none}</p>
        ) : (
          <QuestionList
            questions={view.gap_probes}
            target={{ kind: "interview", assignmentId: assignment.id }}
            canEdit={canEdit}
            regenerationsLeft={view.regenerations_left}
            headings={false}
          />
        )}
        {canEdit && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <LockInterviewButton assignmentId={assignment.id} disabled={short} />
            {short && (
              <p className="text-sm text-muted-foreground">
                {fill(t.review.short, { need, n: usable })}
              </p>
            )}
            {cancel}
          </div>
        )}
      </div>
    );
  }

  // Later statuses arrive with the interview room (I2) and reports (I3).
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {fill(t.status, { status: ar.interviewBank.interviewStatuses[status] })}
      </p>
      {cancel}
    </div>
  );
}

function StartSection({
  applicationId,
  jobId,
  analysisDone,
  canEdit,
  data,
  previousStatus,
}: {
  applicationId: string;
  jobId: string;
  analysisDone: boolean;
  canEdit: boolean;
  data: VirtualInterviewData;
  previousStatus: InterviewStatus | null;
}) {
  const t = ar.interviewBank.panel;
  const previous = data.assignment;
  // The configuration form below is shown only when all of these hold; the
  // notices invite starting again only then (never to a viewer).
  const canStart = canEdit && data.quota !== 0 && data.lockedBank !== null && analysisDone;
  const startAgain = canStart ? ` ${t.failed.startAgain}` : "";

  let notice: React.ReactNode = null;
  // The refusal this notice reports. The gateway records a refused create on
  // the assignment before answering, so the form below hides the same text
  // instead of saying it twice.
  let reported: string | null = null;
  if (previous && (previous.stale || previousStatus === "failed")) {
    // A stale draft is reported as the gateway will record it on the next
    // create: the agent never answered.
    const code = previous.stale ? "agent_unreachable" : previous.last_error;
    reported = code ? interviewErrorMessage(code) : null;
    notice = (
      <Alert variant="destructive">
        <AlertCircle aria-hidden />
        <AlertTitle>{t.failed.title}</AlertTitle>
        <AlertDescription>
          {reported ?? t.failed.generic}
          {/* A spent allowance is not undone by starting again. */}
          {code === "quota_exceeded" ? "" : startAgain}
        </AlertDescription>
      </Alert>
    );
  } else if (previousStatus === "cancelled" || previousStatus === "expired") {
    notice = (
      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription>
          {previousStatus === "cancelled" ? t.cancelled : t.expired}
          {startAgain}
        </AlertDescription>
      </Alert>
    );
  }

  let body: React.ReactNode;
  if (data.quota === 0) {
    body = (
      <Alert variant="info">
        <Info aria-hidden />
        <AlertTitle>{ar.interviewBank.notInPlan}</AlertTitle>
        <AlertDescription>{ar.interviewBank.notInPlanHint}</AlertDescription>
      </Alert>
    );
  } else if (!data.lockedBank) {
    body = (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-5">
        <span className="font-medium">{t.needBank}</span>
        <span className="text-sm text-muted-foreground">{t.needBankHint}</span>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/admin/jobs/${jobId}/interview-bank`} />}
        >
          {t.needBankLink}
          <ArrowLeft aria-hidden />
        </Button>
      </div>
    );
  } else if (!analysisDone) {
    body = <p className="text-sm text-muted-foreground">{t.needAnalysis}</p>;
  } else if (!canEdit) {
    body = previous ? null : <p className="text-sm text-muted-foreground">{t.viewerEmpty}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground tabular-nums">
          {fill(t.bankInUse, {
            version: data.lockedBank.version,
            n: data.lockedBank.approvedCount,
          })}
        </p>
        <InterviewConfigForm applicationId={applicationId} reportedError={reported} />
      </div>
    );
  }

  return (
    <>
      {notice}
      {body}
    </>
  );
}

// What a locked plan holds, by kind: from the plan itself when the agent
// sent it, else from the configuration it was drawn to (the agent refuses a
// lock whose plan does not match the mix).
function planCounts(
  plan: { question_id: string; kind: QuestionKind }[] | null,
  config: StoredInterviewConfig | null
): { label: string; n: number }[] {
  const kinds = ar.interviewBank.kinds;
  if (plan) {
    const order: QuestionKind[] = [
      "warmup",
      "technical",
      "behavioral",
      "situational",
      "gap_probe",
      "coding",
    ];
    return order
      .map((kind) => ({
        label: kinds[kind],
        n: plan.filter((entry) => entry.kind === kind).length,
      }))
      .filter((entry) => entry.n > 0);
  }
  if (!config) return [];
  return [
    { label: kinds.warmup, n: config.mix.warmup },
    { label: kinds.technical, n: config.mix.technical },
    { label: `${kinds.behavioral} / ${kinds.situational}`, n: config.mix.behavioral },
    { label: kinds.gap_probe, n: config.mix.gap_probe },
  ].filter((entry) => entry.n > 0);
}
