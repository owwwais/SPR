"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Link2, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UploadStep } from "@/components/seeker/onboarding/upload-step";
import { requestLegacyLink, type SeekerFormState } from "@/lib/seeker-actions";
import { ar } from "@/lib/i18n/ar";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

// An accountless profile from the superseded talent flow carries this
// account's verified address (plan §2.9). Linking is offered, never done:
// the person asks for a one-time link at the profile's address, and presses
// "confirm" on the page it opens (D26). A confirmed account alone is not
// proof of the address — an organisation owner can create one for any
// address — so the emailed link is what makes the CV move. Choosing a fresh
// start leaves the old profile exactly as it is and shows the upload step.
export function LegacyChoice() {
  const t = ar.seekerOnboarding.legacy;
  const [startNew, setStartNew] = useState(false);
  const [state, requestAction, pending] = useActionState(
    async (): Promise<SeekerFormState> => requestLegacyLink(),
    initialState
  );

  if (startNew) return <UploadStep />;

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-soft">
            <MailCheck className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t.sentTitle}</h2>
            <p className="text-sm leading-7 text-muted-foreground">{t.sentBody}</p>
          </div>
        </div>
        <form action={requestAction}>
          <Button type="submit" variant="link" className="h-auto px-0" disabled={pending}>
            {t.resend}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-soft">
          <Link2 className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{t.body}</p>
        </div>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={requestAction}>
          <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
            {pending ? t.linking : t.link}
          </Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending}
          onClick={() => setStartNew(true)}
        >
          {t.startNew}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.startNewHint}</p>
    </div>
  );
}
