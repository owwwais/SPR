"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { acceptInvitation, type AcceptState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

const initialState: AcceptState = { error: null };

export function AcceptForm({
  token,
  needsName,
}: {
  token: string;
  /** Only asked for when the account has no profile name yet. */
  needsName: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    acceptInvitation.bind(null, token),
    initialState
  );
  const t = ar.invite;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {needsName && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="full_name">{t.fullName}</Label>
          <Input id="full_name" name="full_name" required maxLength={120} />
        </div>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.accepting : t.accept}
      </Button>
    </form>
  );
}
