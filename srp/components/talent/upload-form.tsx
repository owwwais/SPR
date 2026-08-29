"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@/components/jobs/turnstile";
import { uploadCv, type UploadState } from "@/app/(talent)/talent/actions";
import { ar } from "@/lib/i18n/ar";

const initial: UploadState = { error: null, sent: false };

export function UploadForm() {
  const t = ar.talent;
  const [state, formAction, pending] = useActionState(uploadCv, initial);

  if (state.sent) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center">
        <h2 className="font-semibold">{t.checkEmailTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.checkEmailBody}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cv">{t.cv}</Label>
        <Input
          id="cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
        <p className="text-xs text-muted-foreground">{t.cvHint}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required maxLength={200} />
        <p className="text-xs text-muted-foreground">{t.emailHint}</p>
      </div>

      <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />

      {state.error && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-destructive">{state.error}</p>
          {/* Visible on purpose: without a reference, "it doesn't work" is
              the entire report we get. With it, a search in the function's
              logs for this exact string lands on the failing request. */}
          {state.requestId && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {t.requestIdLabel}: {state.code ?? "error"} · {state.requestId}
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
