"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApplyState } from "@/app/(public)/jobs/[id]/apply/actions";
import {
  CV_MAX_BYTES,
  CV_MIME_TYPES,
} from "@/lib/validations/application";
import type { ScreeningQuestionType } from "@/lib/validations/screening";
import { ar } from "@/lib/i18n/ar";

const initialState: ApplyState = { ok: false, error: null, fieldErrors: {} };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function ScreeningField({
  question,
  error,
}: {
  question: ScreeningQuestionType;
  error?: string;
}) {
  const name = `sq_${question.id}`;
  const label = (
    <Label htmlFor={name}>
      {question.label}
      {question.required && <span className="text-destructive"> *</span>}
    </Label>
  );

  if (question.type === "text") {
    return (
      <div className="flex flex-col gap-2">
        {label}
        <Textarea
          id={name}
          name={name}
          rows={3}
          maxLength={2000}
          required={question.required}
        />
        <FieldError message={error} />
      </div>
    );
  }

  const options =
    question.type === "yes_no" ? [ar.apply.yes, ar.apply.no] : question.options;
  const inputType = question.type === "multiple_choice" ? "checkbox" : "radio";

  return (
    <div className="flex flex-col gap-2">
      {label}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type={inputType}
              name={name}
              value={option}
              required={question.required && inputType === "radio"}
              className="size-4 accent-primary"
            />
            {option}
          </label>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function ApplyForm({
  action,
  questions,
}: {
  action: (prev: ApplyState, formData: FormData) => Promise<ApplyState>;
  questions: ScreeningQuestionType[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [cvError, setCvError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = ar.apply;

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center">
        <CheckCircle2 className="size-12 text-primary" aria-hidden />
        <h2 className="text-xl font-semibold">{t.successTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t.successBody}</p>
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-muted-foreground">{t.refCodeLabel}</span>
          <div className="flex items-center gap-2">
            <code
              dir="ltr"
              className="select-all rounded-md border bg-muted px-3 py-1.5 font-mono text-lg font-semibold"
            >
              {state.refCode}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.refCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? t.copied : t.copyRefCode}
            </Button>
          </div>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/track/${state.refCode}`} />}
        >
          {t.trackYourApplication}
        </Button>
      </div>
    );
  }

  const checkFile = (file: File | undefined) => {
    if (!file) return setCvError(null);
    if (!(file.type in CV_MIME_TYPES)) return setCvError(t.errors.cvType);
    if (file.size > CV_MAX_BYTES) return setCvError(t.errors.cvSize);
    setCvError(null);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="full_name">{t.fullName}</Label>
        <Input id="full_name" name="full_name" required maxLength={120} />
        <FieldError message={state.fieldErrors.full_name} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            dir="ltr"
            className="text-start"
          />
          <FieldError message={state.fieldErrors.email} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t.phone}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            dir="ltr"
            className="text-start"
          />
          <FieldError message={state.fieldErrors.phone} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cv">{t.cv}</Label>
        <Input
          id="cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => checkFile(e.target.files?.[0])}
        />
        <p className="text-xs text-muted-foreground">{t.cvHint}</p>
        <FieldError message={cvError ?? state.fieldErrors.cv} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cover_note">{t.coverNote}</Label>
        <Textarea id="cover_note" name="cover_note" rows={5} maxLength={2000} />
        <FieldError message={state.fieldErrors.cover_note} />
      </div>

      {questions.length > 0 && (
        <fieldset className="flex flex-col gap-5 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">
            {t.questionsTitle}
          </legend>
          {questions.map((question) => (
            <ScreeningField
              key={question.id}
              question={question}
              error={state.fieldErrors[`sq_${question.id}`]}
            />
          ))}
        </fieldset>
      )}

      <Button type="submit" size="lg" disabled={pending || cvError !== null}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
