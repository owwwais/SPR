"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteSeekerAccount } from "@/app/(seeker)/me/actions";
import { ar } from "@/lib/i18n/ar";

// Immediate and total for the seeker's own data (plan §2.4) — so the
// dialog says exactly what goes and what stays before anything happens:
// the profile and every CV file go now; applications already sent stay
// with those companies under their own retention (D27, D8); the account
// itself goes too unless it still wears a company hat. The action
// redirects on success, so this component only ever renders a failure.
export function DeleteSeekerData() {
  const t = ar.seekerPortal.settings;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-request would hide the outcome; the dialog stays
        // until the action has answered.
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogTrigger
        render={<Button type="button" variant="destructive" className="w-fit" />}
      >
        <Trash2 aria-hidden />
        {t.deleteButton}
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <ul className="flex list-disc flex-col gap-2 ps-5 text-start">
              {t.deleteConfirmPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await deleteSeekerAccount();
                if (result?.error) setError(result.error);
              });
            }}
          >
            {pending ? t.deleting : t.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
