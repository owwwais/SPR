import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Info,
  ListChecks,
  Loader2,
  Lock,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AutoRefresh } from "@/components/admin/interview-bank/auto-refresh";
import {
  GenerateBankButton,
  RetryBankButton,
} from "@/components/admin/interview-bank/bank-actions";
import { LockBankButton } from "@/components/admin/interview-bank/lock-bank-button";
import { QuestionList } from "@/components/admin/interview-bank/question-list";
import {
  MIN_APPROVED_TO_LOCK,
  approvedByShare,
  countByStatus,
  fill,
  shortHash,
} from "@/components/admin/interview-bank/helpers";
import { canWrite, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchJobBank,
  interviewErrorMessage,
  type GatewayBank,
} from "@/lib/interviews";
import { ar } from "@/lib/i18n/ar";
import { formatDate, formatDateTime } from "@/lib/format";
import type { JobBankStatus } from "@/types/database";

export const metadata: Metadata = {
  title: ar.interviewBank.title,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_VARIANT: Record<
  JobBankStatus,
  "secondary" | "default" | "success" | "warning" | "destructive"
> = {
  generating: "secondary",
  awaiting_review: "warning",
  locked: "success",
  failed: "destructive",
  superseded: "secondary",
};

type BankRow = {
  id: string;
  version: number;
  status: JobBankStatus;
  bank_hash: string | null;
  locked_at: string | null;
  last_error: string | null;
  approved_count: number;
  created_at: string;
};

// A job's core question bank (I1, D30): generated once from the job's
// requirements, reviewed question by question (mandatory), locked, and then
// shared by every virtual interview for the job so candidates are compared
// on the same structure. Each lock is final; a change is a new version.
export default async function InterviewBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireMembership();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const editable = canWrite(session.role);

  // Every read is scoped to the active organization in code as well as by
  // RLS (§2.1): a job id from another tenant is simply not found.
  const supabase = await createClient();
  const [jobRes, banksRes, orgRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title")
      .eq("id", id)
      .eq("org_id", session.org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("interview_job_banks")
      .select(
        "id, version, status, bank_hash, locked_at, last_error, approved_count, created_at"
      )
      .eq("org_id", session.org.id)
      .eq("job_id", id)
      .order("version", { ascending: false })
      .limit(50),
    supabase
      .from("organizations")
      .select("monthly_interview_quota")
      .eq("id", session.org.id)
      .maybeSingle(),
  ]);
  const job = jobRes.data;
  if (!job) notFound();
  if (banksRes.error) console.error("interview banks read failed:", banksRes.error.code);

  const banks = (banksRes.data ?? []) as BankRow[];
  // D33: 0 = the plan includes no interviews. A failed read counts as 0, so
  // nothing that would cost a model call is offered on uncertain ground.
  const quota = orgRes.data ? orgRes.data.monthly_interview_quota : 0;
  const notInPlan = quota === 0;

  // The bank on screen is the newest version still in play; the job's
  // CURRENT bank (what interviews use) is its newest locked version.
  const current = banks.find((b) => b.status !== "superseded") ?? null;
  const inEffect = banks.find((b) => b.status === "locked") ?? null;

  // The questions live in the agent; bank_get also brings the row up to
  // date (and fails a creation that died mid-way instead of spinning).
  const fetched = current ? await fetchJobBank(current.id) : null;
  const bank: GatewayBank | null = fetched?.ok ? fetched.data : null;
  const loadError =
    fetched && !fetched.ok ? interviewErrorMessage(fetched.code) : null;
  const status: JobBankStatus | null = bank?.status ?? current?.status ?? null;
  const olderInEffect =
    inEffect && current && inEffect.id !== current.id ? inEffect : null;

  const t = ar.interviewBank;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={`/admin/jobs/${job.id}/applicants`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {t.backToApplicants}
        </Link>
        <h1 className="text-2xl font-bold">
          {t.title}: {job.title}
        </h1>
        {current && status && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t.locked.version} {current.version}
            </span>
            <Badge variant={STATUS_VARIANT[status]}>{t.bankStatuses[status]}</Badge>
          </div>
        )}
        {!editable && (
          <p className="mt-2 text-sm text-muted-foreground">{t.viewerNote}</p>
        )}
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>{t.unavailable}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {olderInEffect && status !== "locked" && (
        <Alert variant="info">
          <Info aria-hidden />
          <AlertDescription>
            {fill(t.review.previousLocked, { version: olderInEffect.version })}
          </AlertDescription>
        </Alert>
      )}

      {/* ------------------------------ none ------------------------------ */}
      {!current && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-soft">
                <ListChecks className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold">{t.core.title}</h2>
            </div>
            <p className="max-w-[68ch] leading-relaxed text-body">{t.core.body}</p>
            <ol className="flex max-w-[68ch] list-decimal flex-col gap-1 ps-5 text-sm">
              {t.core.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="max-w-[68ch] text-sm text-muted-foreground">{t.core.fairness}</p>
            {notInPlan ? (
              <NotInPlan />
            ) : (
              editable && <GenerateBankButton jobId={job.id} label={t.generate} />
            )}
          </CardContent>
        </Card>
      )}

      {/* --------------------------- generating --------------------------- */}
      {current && status === "generating" && (
        <Card>
          <CardContent>
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-dashed p-6"
            >
              <Loader2
                className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.generating.title}</span>
                <span className="text-sm text-muted-foreground">{t.generating.body}</span>
              </div>
            </div>
            <AutoRefresh />
          </CardContent>
        </Card>
      )}

      {/* ----------------------------- failed ----------------------------- */}
      {current && status === "failed" && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertTitle>{t.failed.title}</AlertTitle>
              <AlertDescription>
                {interviewErrorMessage(bank ? bank.failure : current.last_error)}
              </AlertDescription>
            </Alert>
            {editable &&
              (notInPlan ? <NotInPlan /> : <RetryBankButton bankId={current.id} />)}
          </CardContent>
        </Card>
      )}

      {/* ------------------------- awaiting review ------------------------ */}
      {current && status === "awaiting_review" && bank && (
        <ReviewSection bank={bank} editable={editable} />
      )}

      {/* ----------------------------- locked ----------------------------- */}
      {current && status === "locked" && (
        <LockedSection
          bank={bank}
          row={current}
          jobId={job.id}
          editable={editable}
          notInPlan={notInPlan}
        />
      )}

      {banks.length > 1 && <History banks={banks} />}
    </div>
  );
}

function NotInPlan() {
  return (
    <Alert variant="info">
      <Info aria-hidden />
      <AlertTitle>{ar.interviewBank.notInPlan}</AlertTitle>
      <AlertDescription>{ar.interviewBank.notInPlanHint}</AlertDescription>
    </Alert>
  );
}

function ReviewSection({ bank, editable }: { bank: GatewayBank; editable: boolean }) {
  const t = ar.interviewBank;
  const counts = countByStatus(bank.questions);
  const shares = approvedByShare(bank.questions);
  const blockedReason =
    counts.pending > 0
      ? fill(t.review.blockedPending, { n: counts.pending })
      : counts.approved < MIN_APPROVED_TO_LOCK
        ? fill(t.review.blockedFew, { min: MIN_APPROVED_TO_LOCK, n: counts.approved })
        : null;

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t.review.title}</h2>
            <p className="max-w-[68ch] text-sm text-muted-foreground">{t.review.hint}</p>
          </div>
          <dl className="grid grid-cols-3 divide-x rounded-lg border text-center">
            {(["pending", "approved", "removed"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t.counts[key]}</dt>
                <dd className="text-xl font-semibold tabular-nums">{counts[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground tabular-nums">
            {fill(t.counts.byKind, shares)}
          </p>
          {editable && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <LockBankButton bankId={bank.id} disabled={blockedReason !== null} />
              {blockedReason && (
                <p className="text-sm text-muted-foreground">{blockedReason}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <QuestionList
        questions={bank.questions}
        target={{ kind: "job", bankId: bank.id }}
        canEdit={editable}
        regenerationsLeft={bank.regenerations_left}
      />
    </>
  );
}

function LockedSection({
  bank,
  row,
  jobId,
  editable,
  notInPlan,
}: {
  bank: GatewayBank | null;
  row: BankRow;
  jobId: string;
  editable: boolean;
  notInPlan: boolean;
}) {
  const t = ar.interviewBank;
  const hash = bank?.bank_hash ?? row.bank_hash;
  const lockedAt = bank?.locked_at ?? row.locked_at;
  const approved = bank ? bank.questions.filter((q) => q.status === "approved") : [];

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-success" aria-hidden />
            <h2 className="text-lg font-semibold">{t.locked.title}</h2>
          </div>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t.locked.version}:</dt>
              <dd className="tabular-nums">{row.version}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t.locked.hash}:</dt>
              <dd>
                <code
                  dir="ltr"
                  title={hash ?? undefined}
                  className="rounded bg-muted px-1 font-mono text-xs"
                >
                  {shortHash(hash)}
                </code>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t.locked.lockedAt}:</dt>
              <dd>{lockedAt ? formatDateTime(lockedAt) : "—"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t.locked.approved}:</dt>
              <dd className="tabular-nums">{bank ? approved.length : row.approved_count}</dd>
            </div>
          </dl>
          {bank && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {fill(t.counts.byKind, approvedByShare(bank.questions))}
            </p>
          )}
          <p className="max-w-[68ch] text-sm text-muted-foreground">{t.locked.hint}</p>
          {editable &&
            (notInPlan ? (
              <NotInPlan />
            ) : (
              <GenerateBankButton jobId={jobId} label={t.newVersion} variant="outline" />
            ))}
        </CardContent>
      </Card>
      {bank && (
        <QuestionList
          questions={approved}
          target={{ kind: "job", bankId: bank.id }}
          canEdit={false}
          regenerationsLeft={0}
        />
      )}
    </>
  );
}

function History({ banks }: { banks: BankRow[] }) {
  const t = ar.interviewBank;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t.history.title}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.history.version}</TableHead>
              <TableHead>{t.history.status}</TableHead>
              <TableHead>{t.history.createdAt}</TableHead>
              <TableHead>{t.history.hash}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banks.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums">{row.version}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>
                    {t.bankStatuses[row.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(row.created_at)}
                </TableCell>
                <TableCell>
                  {row.bank_hash ? (
                    <code dir="ltr" title={row.bank_hash} className="font-mono text-xs">
                      {shortHash(row.bank_hash)}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
