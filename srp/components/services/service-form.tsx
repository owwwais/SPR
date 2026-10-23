"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { runService, type ServiceFormState } from "@/app/(dashboard)/admin/services/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ar } from "@/lib/i18n/ar";
import type { JobOption } from "@/lib/services";
import type { ServiceKind } from "@/lib/validations/services";

const initialState: ServiceFormState = { error: null };
const t = ar.services;

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> {t.fields.optional}</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function JobSelect({
  jobs,
  required,
  defaultValue,
  name = "job_id",
}: {
  jobs: JobOption[];
  required?: boolean;
  defaultValue?: string;
  name?: string;
}) {
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{t.fields.noJobs}</p>;
  return (
    <select id={name} name={name} required={required} defaultValue={defaultValue ?? ""} className={selectClass}>
      <option value="">{t.fields.jobPlaceholder}</option>
      {jobs.map((job) => (
        <option key={job.id} value={job.id}>
          {job.title}
        </option>
      ))}
    </select>
  );
}

export function ServiceForm({
  kind,
  jobs,
  canRun,
  defaults = {},
}: {
  kind: ServiceKind;
  jobs: JobOption[];
  canRun: boolean;
  /** Prefill from a link, e.g. team formation's "analyse this role". */
  defaults?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(runService.bind(null, kind), initialState);
  const [paySource, setPaySource] = useState<"job" | "text">(jobs.length > 0 ? "job" : "text");
  const needsJob = kind === "ad_audit" || kind === "interview_kit" || kind === "onboarding";
  const noJobs = needsJob && jobs.length === 0;

  if (!canRun) return <p className="text-sm text-muted-foreground">{t.readOnly}</p>;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {kind === "job_need" && <JobNeedFields jobs={jobs} defaults={defaults} />}

      {kind === "pay_grade" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t.kinds.pay_grade.fields.source}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["job", "text"] as const).map((source) => (
                <label key={source} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="source"
                    value={source}
                    checked={paySource === source}
                    onChange={() => setPaySource(source)}
                    disabled={source === "job" && jobs.length === 0}
                    className="size-4 accent-primary"
                  />
                  {source === "job" ? t.kinds.pay_grade.fields.fromJob : t.kinds.pay_grade.fields.fromText}
                </label>
              ))}
            </div>
          </fieldset>
          {paySource === "job" ? (
            <Field id="job_id" label={t.fields.job}>
              <JobSelect jobs={jobs} required />
            </Field>
          ) : (
            <>
              <Field id="title" label={t.kinds.pay_grade.fields.title}>
                <Input id="title" name="title" required minLength={2} maxLength={120} defaultValue={defaults.title} />
              </Field>
              <Field id="summary" label={t.kinds.pay_grade.fields.summary} hint={t.kinds.pay_grade.fields.summaryHint}>
                <Textarea id="summary" name="summary" required minLength={20} maxLength={4000} rows={6} />
              </Field>
            </>
          )}
        </>
      )}

      {kind === "team" && (
        <>
          <Field id="goal" label={t.kinds.team.fields.goal} hint={t.kinds.team.fields.goalHint}>
            <Textarea id="goal" name="goal" required minLength={20} maxLength={2000} rows={5} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="timeline" label={t.kinds.team.fields.timeline} optional>
              <Input id="timeline" name="timeline" maxLength={200} />
            </Field>
            <Field id="team_size" label={t.kinds.team.fields.teamSize} optional>
              <Input id="team_size" name="team_size" type="number" min={2} max={12} dir="ltr" className="text-start" />
            </Field>
          </div>
        </>
      )}

      {needsJob && (
        <Field id="job_id" label={t.fields.job}>
          <JobSelect jobs={jobs} required defaultValue={defaults.job_id} />
        </Field>
      )}

      {kind === "onboarding" && (
        <Field id="context" label={t.kinds.onboarding.fields.context} hint={t.kinds.onboarding.fields.contextHint} optional>
          <Textarea id="context" name="context" maxLength={800} rows={3} />
        </Field>
      )}

      <p className="text-xs text-muted-foreground">
        {t.fields.noPersonalData} {t.costNote}
      </p>

      <div>
        <Button type="submit" disabled={pending || noJobs}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? t.running : t.run}
        </Button>
      </div>
    </form>
  );
}

function JobNeedFields({ jobs, defaults }: { jobs: JobOption[]; defaults: Record<string, string> }) {
  const f = t.kinds.job_need.fields;
  return (
    <>
      {jobs.length > 0 && (
        <Field id="job_id" label={f.reviewJob} hint={f.reviewJobHint} optional>
          <JobSelect jobs={jobs} />
        </Field>
      )}
      <Field id="title_hint" label={f.titleHint} optional>
        <Input id="title_hint" name="title_hint" maxLength={120} defaultValue={defaults.title_hint} />
      </Field>
      <Field id="problem" label={f.problem} hint={f.problemHint}>
        <Textarea id="problem" name="problem" required minLength={10} maxLength={1500} rows={4} defaultValue={defaults.problem} />
      </Field>
      <Field id="outcomes" label={f.outcomes} hint={f.outcomesHint}>
        <Textarea id="outcomes" name="outcomes" required minLength={10} maxLength={1500} rows={4} />
      </Field>
      <Field id="team_context" label={f.team} hint={f.teamHint} optional>
        <Textarea id="team_context" name="team_context" maxLength={800} rows={2} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="location" label={f.location} optional>
          <Input id="location" name="location" maxLength={120} />
        </Field>
        <Field id="work_mode" label={f.workMode} optional>
          <select id="work_mode" name="work_mode" defaultValue="" className={selectClass}>
            <option value="">—</option>
            {(Object.keys(f.workModes) as (keyof typeof f.workModes)[]).map((mode) => (
              <option key={mode} value={mode}>
                {f.workModes[mode]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="employment_type" label={f.employmentType} optional>
          <select id="employment_type" name="employment_type" defaultValue="" className={selectClass}>
            <option value="">—</option>
            {(Object.keys(ar.jobs.typeLabels) as (keyof typeof ar.jobs.typeLabels)[]).map((type) => (
              <option key={type} value={type}>
                {ar.jobs.typeLabels[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="level" label={f.level} optional>
          <select id="level" name="level" defaultValue={defaults.level ?? "unknown"} className={selectClass}>
            {(Object.keys(f.levels) as (keyof typeof f.levels)[]).map((level) => (
              <option key={level} value={level}>
                {f.levels[level]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="tools" label={f.tools} optional>
        <Input id="tools" name="tools" maxLength={800} defaultValue={defaults.tools} />
      </Field>
      <Field id="existing_description" label={f.existing} optional>
        <Textarea id="existing_description" name="existing_description" maxLength={12000} rows={4} />
      </Field>
    </>
  );
}
