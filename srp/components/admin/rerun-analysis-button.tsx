"use client";

import { RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

// Re-running an analysis spends one from the month's quota (D16) and
// replaces the evaluation HR is looking at, so it asks first (P4c). The
// action is the bound server action from the page; nothing else changes.
export function RerunAnalysisButton({
  action,
  variant = "ghost",
}: {
  action: () => Promise<void>;
  variant?: "ghost" | "outline";
}) {
  const t = ar.evaluation;

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant={variant} size="sm" />}>
        <RefreshCw className="size-3.5" aria-hidden />
        {t.retry}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.rerunTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.rerunBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.rerunCancel}</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit">{t.rerunConfirm}</AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
