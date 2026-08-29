"use client";

import { useState, useTransition } from "react";
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
import { deleteProfile, setVisibility } from "@/app/(talent)/talent/actions";
import { ar } from "@/lib/i18n/ar";

export function ManagePanel({
  token,
  url,
  status,
}: {
  token: string;
  url: string;
  status: string;
}) {
  const t = ar.talent;
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const published = status === "published";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t.manageTitle}</span>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <code className="flex-1 truncate text-xs" dir="ltr">{url}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? t.copied : t.copyLink}
          </Button>
        </div>
      </div>

      {/* Hiding is instant and reversible; the page 404s while hidden. */}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(() => setVisibility(token, !published))
        }
      >
        {published ? t.hidePage : t.showPage}
      </Button>

      {/* Deletion is immediate and total — no soft delete, no grace period. */}
      <AlertDialog>
        <AlertDialogTrigger
          render={<Button type="button" variant="destructive" disabled={pending} />}
        >
          {t.deletePage}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startTransition(() => deleteProfile(token))}
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
