"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CircleCheck } from "lucide-react";
import { changePassword, type PasswordState } from "@/app/auth/actions";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

const initialState: PasswordState = { error: null, done: false };

// For a signed-in account, in the workspace account page and the seeker
// settings. An account that only ever signed in with Google has no password
// to prove, so it is offered the recovery email instead, which sets one.
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  const t = ar.auth.changePassword;

  if (!hasPassword) {
    return (
      <p className="text-sm text-muted-foreground">
        {t.oauthOnly}{" "}
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          {t.oauthOnlyCta}
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.done && (
        <Alert variant="success" role="status">
          <CircleCheck className="size-4" aria-hidden />
          <AlertDescription>{t.done}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="current-password">{t.currentPassword}</Label>
        <Input
          id="current-password"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className="text-start"
        />
      </div>
      <NewPasswordFields idPrefix="change" />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t.saving : t.submit}
      </Button>
    </form>
  );
}
