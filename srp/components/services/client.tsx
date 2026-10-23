"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, FilePlus2, Loader2, Printer } from "lucide-react";
import {
  createJobFromNeed,
  savePayGrades,
  type PayGradesState,
} from "@/app/(dashboard)/admin/services/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar } from "@/lib/i18n/ar";
import type { PayGrade } from "@/lib/services";
import { GRADE_COUNT, positionInRange } from "@/lib/validations/services";

const t = ar.services;
const p = t.results.payGrade;
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn");

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      {t.print}
    </Button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? ar.evaluation.copied : t.results.adAudit.copy}
    </Button>
  );
}

export function CreateJobButton({ runId }: { runId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createJobFromNeed(runId);
            if (result?.error) setError(result.error);
          })
        }
        className="self-start"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FilePlus2 className="size-4" aria-hidden />}
        {t.results.jobNeed.createJob}
      </Button>
      <p className="text-xs text-muted-foreground">{t.results.jobNeed.createJobHint}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const money = (n: number) => `${nf.format(n)} ${p.sar}`;

// The grade is a suggestion; HR may adopt another. The range comes from the
// company's own structure only, and the placement is the same for everyone
// at a level — arithmetic, not a model output (positionInRange).
export function PayPlacement({ suggested, grades }: { suggested: number; grades: PayGrade[] }) {
  const [grade, setGrade] = useState(suggested);
  const band = grades.find((g) => g.grade === grade);
  const position = band ? positionInRange(band.min_monthly, band.max_monthly) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="use-grade">
          {p.useGrade}
          <select
            id="use-grade"
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
            className="h-9 w-28 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {Array.from({ length: GRADE_COUNT }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <p className="max-w-[56ch] text-xs text-muted-foreground">{p.overrideHint}</p>
      </div>

      {!band || !position ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{p.noBand}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
            {[
              [p.min, band.min_monthly],
              [p.midpoint, position.midpoint],
              [p.max, band.max_monthly],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex flex-col gap-0.5 bg-card px-3 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  <bdi>{money(Number(value))}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{p.placement}</h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {(["entry", "competent", "expert"] as const).map((level) => (
                <li key={level} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{p[level]}</span>
                  <bdi className="font-medium tabular-nums">
                    {money(position[level].from)} – {money(position[level].to)}
                  </bdi>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {p.monthly}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const initialPay: PayGradesState = { saved: false, error: null };

export function PayStructureForm({ grades, canEdit }: { grades: PayGrade[]; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(savePayGrades, initialPay);
  const byGrade = new Map(grades.map((g) => [g.grade, g]));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">{p.grade}</th>
              <th className="py-2 text-start font-medium">{p.min}</th>
              <th className="py-2 text-start font-medium">{p.max}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Array.from({ length: GRADE_COUNT }, (_, i) => i + 1).map((grade) => {
              const row = byGrade.get(grade);
              return (
                <tr key={grade}>
                  <td className="py-1.5 pe-3 font-medium tabular-nums">{grade}</td>
                  {(["min", "max"] as const).map((edge) => (
                    <td key={edge} className="py-1.5 pe-3">
                      <Input
                        name={`${edge}_${grade}`}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        dir="ltr"
                        aria-label={`${edge === "min" ? p.min : p.max} — ${p.grade} ${grade}`}
                        defaultValue={row ? String(edge === "min" ? row.min_monthly : row.max_monthly) : ""}
                        disabled={!canEdit}
                        className="h-8 w-32 text-start tabular-nums"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {p.save}
          </Button>
          {!pending && state.saved && (
            <span className="flex items-center gap-1 text-sm text-success" role="status">
              <Check className="size-4" aria-hidden />
              {p.saved}
            </span>
          )}
          {!pending && state.error && (
            <span role="alert" className="text-sm text-destructive">
              {state.error}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{p.structureReadOnly}</p>
      )}
    </form>
  );
}
