"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { confirmLegacyLink, type SeekerFormState } from "@/lib/seeker-actions";
import { ar } from "@/lib/i18n/ar";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

// The one press that completes a legacy link. On success the action
// redirects to the onboarding page, which renders the linked profile's step.
export function ConfirmLegacyLink({ token }: { token: string }) {
  const t = ar.seekerOnboarding.legacy;
  const [state, action, pending] = useActionState(confirmLegacyLink, initialState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.confirming : t.confirm}
      </Button>
    </form>
  );
}
