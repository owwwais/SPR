"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { signUp, type SignupState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

const initialState: SignupState = { error: null, awaitingConfirmation: false };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const t = ar.auth;

  if (state.awaitingConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">{t.confirmEmailTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.confirmEmailBody}</p>
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
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          dir="ltr"
          className="text-start"
        />
        <p className="text-xs text-muted-foreground">{t.passwordHint}</p>
      </div>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.signingUp : t.signupSubmit}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.haveAccount}{" "}
        <Link href="/login" className="text-primary hover:underline">
          {t.submit}
        </Link>
      </p>
    </form>
  );
}
