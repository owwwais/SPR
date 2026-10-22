"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createVirtualInterview,
  type ConfigField,
  type CreateInterviewState,
} from "@/app/(dashboard)/admin/interviews/actions";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";
import { fill } from "@/components/admin/interview-bank/helpers";

const TOTAL_MIN = 4;
const TOTAL_MAX = 15;

const RESULT_OPTIONS = ["none", "completion", "summary"] as const;
const PASTE_OPTIONS = ["record", "block"] as const;

const initialState: CreateInterviewState = { ok: false, error: null, fieldErrors: {} };

// The staff member's choices for one candidate's interview. Every field is
// controlled: React resets uncontrolled fields after a form action, which
// would throw away the choices whenever the server refuses them. The server
// action re-validates everything and fixes what is not offered yet (text
// mode only, no coding) regardless of what is posted.
export function InterviewConfigForm({
  applicationId,
  reportedError = null,
}: {
  applicationId: string;
  /** A refusal the panel's notice already shows; not repeated here. */
  reportedError?: string | null;
}) {
  const t = ar.interviewBank.panel.form;
  const [state, formAction, pending] = useActionState(
    createVirtualInterview.bind(null, applicationId),
    initialState
  );

  const [warmup, setWarmup] = useState(true);
  const [technical, setTechnical] = useState("4");
  const [behavioral, setBehavioral] = useState("3");
  const [gapProbe, setGapProbe] = useState("2");
  const [duration, setDuration] = useState("30");
  const [extraTime, setExtraTime] = useState("0");
  const [candidateResult, setCandidateResult] =
    useState<(typeof RESULT_OPTIONS)[number]>("completion");
  const [pastePolicy, setPastePolicy] = useState<(typeof PASTE_OPTIONS)[number]>("record");

  const count = (value: string) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  };
  const total = (warmup ? 1 : 0) + count(technical) + count(behavioral) + count(gapProbe);
  const totalOk = total >= TOTAL_MIN && total <= TOTAL_MAX;
  const fieldError = (field: ConfigField) => state.fieldErrors[field];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <h3 className="font-semibold">{t.title}</h3>

      <fieldset className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="warmup"
            checked={warmup}
            onChange={(e) => setWarmup(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t.warmup}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <CountField
            name="technical"
            label={t.technical}
            value={technical}
            onChange={setTechnical}
            error={fieldError("technical")}
          />
          <CountField
            name="behavioral"
            label={t.behavioral}
            value={behavioral}
            onChange={setBehavioral}
            error={fieldError("behavioral")}
          />
          <CountField
            name="gap_probe"
            label={t.gapProbes}
            hint={t.gapProbesHint}
            value={gapProbe}
            onChange={setGapProbe}
            error={fieldError("gap_probe")}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vi-coding" className="flex items-center gap-2">
              {t.coding}
              <Badge variant="secondary">{t.soon}</Badge>
            </Label>
            <Input
              id="vi-coding"
              type="number"
              dir="ltr"
              className="text-start tabular-nums"
              value={0}
              disabled
              readOnly
            />
          </div>
        </div>

        <p
          className={cn(
            "text-sm tabular-nums",
            totalOk ? "text-muted-foreground" : "text-destructive"
          )}
          aria-live="polite"
        >
          {fill(t.total, { n: total })}
          {!totalOk && ` — ${t.totalRange}`}
        </p>
        {fieldError("total") && (
          <p role="alert" className="text-sm text-destructive">
            {fieldError("total")}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.mode}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled readOnly className="size-4 accent-primary" />
            {t.modeText}
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={false} disabled readOnly className="size-4" />
            {t.modeVoice}
            <Badge variant="secondary">{t.soon}</Badge>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vi-duration">{t.duration}</Label>
          <Input
            id="vi-duration"
            name="duration_minutes"
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="text-start tabular-nums"
            min={10}
            max={120}
            step={1}
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            aria-invalid={fieldError("duration_minutes") ? true : undefined}
          />
          {fieldError("duration_minutes") && (
            <p className="text-sm text-destructive">{fieldError("duration_minutes")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vi-extra">{t.extraTime}</Label>
          <Input
            id="vi-extra"
            name="extra_time_percent"
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="text-start tabular-nums"
            min={0}
            max={100}
            step={1}
            required
            value={extraTime}
            onChange={(e) => setExtraTime(e.target.value)}
            aria-invalid={fieldError("extra_time_percent") ? true : undefined}
          />
          {fieldError("extra_time_percent") && (
            <p className="text-sm text-destructive">{fieldError("extra_time_percent")}</p>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.candidateResult}</legend>
        {RESULT_OPTIONS.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="candidate_result"
              value={option}
              checked={candidateResult === option}
              onChange={() => setCandidateResult(option)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="flex flex-col">
              <span>{t.results[option].label}</span>
              <span className="text-muted-foreground">{t.results[option].hint}</span>
            </span>
          </label>
        ))}
        {fieldError("candidate_result") && (
          <p className="text-sm text-destructive">{fieldError("candidate_result")}</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.pastePolicy}</legend>
        {PASTE_OPTIONS.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="paste_policy"
              value={option}
              checked={pastePolicy === option}
              onChange={() => setPastePolicy(option)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="flex flex-col">
              <span>{t.paste[option].label}</span>
              <span className="text-muted-foreground">{t.paste[option].hint}</span>
            </span>
          </label>
        ))}
        {fieldError("paste_policy") && (
          <p className="text-sm text-destructive">{fieldError("paste_policy")}</p>
        )}
      </fieldset>

      <div className="flex flex-col items-start gap-2 border-t pt-4">
        <Button type="submit" disabled={pending || !totalOk}>
          <Sparkles aria-hidden />
          {pending ? t.submitting : t.submit}
        </Button>
        {state.error && state.error !== reportedError && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

function CountField({
  name,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `vi-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        dir="ltr"
        className="text-start tabular-nums"
        min={0}
        max={15}
        step={1}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
