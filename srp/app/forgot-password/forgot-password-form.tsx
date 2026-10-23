"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { requestPasswordReset, type PasswordState } from "@/app/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

const initialState: PasswordState = { error: null, done: false };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const t = ar.auth.forgot;

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">{t.sentTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.sentBody}</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t.backToLogin}
        </Link>
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{ar.auth.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          className="text-start"
        />
      </div>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.sending : t.submit}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </form>
  );
}
