"use client";

import { useState, useTransition } from "react";
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
import type { InterviewActionResult } from "@/app/(dashboard)/admin/interviews/actions";

type Dialog = { title: string; body: string; confirm: string; cancel: string };

// A button whose action cannot be undone (locking, cancelling): it asks first,
// stays open while the action runs, and shows the server's answer in Arabic
// under the button when it refuses.
export function ConfirmButton({
  label,
  pendingLabel,
  dialog,
  onConfirm,
  disabled = false,
  variant = "default",
  icon,
}: {
  label: string;
  pendingLabel: string;
  dialog: Dialog;
  onConfirm: () => Promise<InterviewActionResult>;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <AlertDialogTrigger
          render={<Button type="button" variant={variant} disabled={disabled || pending} />}
        >
          {icon}
          {pending ? pendingLabel : label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{dialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await onConfirm();
                  setOpen(false);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              {pending ? pendingLabel : dialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
