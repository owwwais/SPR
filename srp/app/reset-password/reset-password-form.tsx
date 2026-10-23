"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CircleCheck } from "lucide-react";
import { setNewPassword, type PasswordState } from "@/app/auth/actions";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

const initialState: PasswordState = { error: null, done: false };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, initialState);
  const t = ar.auth.reset;

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <CircleCheck className="size-10 text-success" aria-hidden />
        <h2 className="text-lg font-semibold">{t.doneTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.doneBody}</p>
        {/* /onboarding routes by the rows the account has (D26). */}
        <Button nativeButton={false} render={<Link href="/onboarding" />} className="mt-2">
          {t.continue}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <NewPasswordFields />
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.saving : t.submit}
      </Button>
    </form>
  );
}
