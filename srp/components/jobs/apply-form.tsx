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
import { ar } from "@/lib/i18n/ar";

const initialState: ApplyState = { ok: false, error: null, fieldErrors: {} };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ApplyForm({
  action,
}: {
  action: (prev: ApplyState, formData: FormData) => Promise<ApplyState>;
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

      <Button type="submit" size="lg" disabled={pending || cvError !== null}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
