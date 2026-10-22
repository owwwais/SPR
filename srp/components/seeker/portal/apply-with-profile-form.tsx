"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScreeningQuestionsFieldset } from "@/components/jobs/apply-form";
import { FieldError } from "@/components/seeker/portal/field-error";
import { keepValuesSubmit } from "@/components/seeker/portal/keep-values-submit";
import type { ApplyWithProfileState } from "@/app/(seeker)/me/actions";
import type { ScreeningQuestionType } from "@/lib/validations/screening";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const initialState: ApplyWithProfileState = {
  ok: false,
  error: null,
  fieldErrors: {},
};

export type CvChoice = {
  id: string;
  /** "<type> — رُفعت في <date>", built on the server. */
  label: string;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25 aria-invalid:border-destructive";

// Applying with the stored profile (D27). Nothing identifying is typed
// here: name, email and phone come from the profile inside
// submit-application, and the CV is one of the seeker's own analysed
// versions, copied for this company. What the seeker decides is which
// version, their answers, an optional note — and, every time, whether to
// share with this company for this job. The consent box starts unchecked
// and is never remembered.
export function ApplyWithProfileForm({
  action,
  company,
  cvChoices,
  questions,
}: {
  action: (
    prev: ApplyWithProfileState,
    formData: FormData
  ) => Promise<ApplyWithProfileState>;
  company: string;
  cvChoices: CvChoice[];
  questions: ScreeningQuestionType[];
}) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const t = ar.seekerPortal.apply;

  if (state.ok) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 p-3 text-center"
      >
        <CheckCircle2 className="size-10 text-success" strokeWidth={1.75} aria-hidden />
        <h2 className="text-xl font-semibold">{t.successTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t.successBody}</p>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{t.refCodeLabel}</span>
          <code
            dir="ltr"
            className="select-all rounded-md border bg-surface-soft px-3 py-1.5 font-mono text-lg font-semibold"
          >
            {state.refCode}
          </code>
        </div>
        <Button nativeButton={false} render={<Link href="/me/applications" />}>
          {t.goToApplications}
        </Button>
      </div>
    );
  }

  const fieldErrors = state.fieldErrors;

  return (
    <form onSubmit={keepValuesSubmit(dispatch)} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="cv_version_id">{t.cvLabel}</Label>
        <select
          id="cv_version_id"
          name="cv_version_id"
          defaultValue={cvChoices[0]?.id}
          className={SELECT_CLASS}
          aria-invalid={fieldErrors.cv_version_id ? true : undefined}
        >
          {cvChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <FieldError message={fieldErrors.cv_version_id} />
      </div>

      <ScreeningQuestionsFieldset questions={questions} fieldErrors={fieldErrors} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="cover_note">{t.coverNote}</Label>
        <Textarea
          id="cover_note"
          name="cover_note"
          rows={4}
          maxLength={2000}
          aria-invalid={fieldErrors.cover_note ? true : undefined}
        />
        <FieldError message={fieldErrors.cover_note} />
      </div>

      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-lg border p-4",
          fieldErrors.consent && "border-destructive"
        )}
      >
        <label className="flex cursor-pointer items-start gap-3">
          {/* aria-required, not required: the browser's own bubble speaks
              the browser's language, often English. The refusal comes back
              from submit-application as the Arabic field error below, and
              costs nothing — consent is checked before any write. */}
          <input
            type="checkbox"
            name="consent"
            aria-required="true"
            className="mt-1 size-4 shrink-0 accent-primary"
            aria-describedby="consent-hint"
            aria-invalid={fieldErrors.consent ? true : undefined}
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t.consent.replace("{company}", company)}</span>
            <span id="consent-hint" className="text-sm text-muted-foreground">
              {t.consentHint}
            </span>
          </span>
        </label>
        <FieldError message={fieldErrors.consent} />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="sm:w-fit">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
