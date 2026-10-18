"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Link2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UploadStep } from "@/components/seeker/onboarding/upload-step";
import { linkLegacyProfile, type SeekerFormState } from "@/lib/seeker-actions";
import { ar } from "@/lib/i18n/ar";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

// An accountless profile from the superseded talent flow carries this
// account's verified address (plan §2.9). Linking is offered, never done:
// the person's press on the button is the consent (D26). Choosing a fresh
// start leaves the old profile exactly as it is and shows the upload step.
//
// On success the action revalidates this page, which renders whichever step
// the linked profile has reached (or forwards to /me when it is complete).
export function LegacyChoice() {
  const t = ar.seekerOnboarding.legacy;
  const [startNew, setStartNew] = useState(false);
  const [state, linkAction, pending] = useActionState(
    async (): Promise<SeekerFormState> => linkLegacyProfile(),
    initialState
  );

  if (startNew) return <UploadStep />;

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
        <form action={linkAction}>
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
