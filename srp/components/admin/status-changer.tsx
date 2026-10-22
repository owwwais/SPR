"use client";

import { useActionState, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  changeApplicationStatus,
  type StatusChangeState,
} from "@/app/(dashboard)/admin/applications/actions";
import { ar } from "@/lib/i18n/ar";
import type { AppStatus } from "@/types/database";

const APP_STATUSES: AppStatus[] = [
  "new",
  "under_review",
  "interview",
  "accepted",
  "rejected",
];

// #8: fixed, neutral options only — matches status_history.public_reason's
// check constraint (0023). Never free text: this is the one sentence class
// that reaches the applicant, so it stays out of anyone's hands but a
// short, pre-approved list.
const REJECTION_REASONS = [
  "more_suitable_candidate",
  "requirements_mismatch",
  "position_filled",
  "position_cancelled",
  "other",
] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25";

// The two decisions an applicant is told about as a final answer.
const CONFIRMED: AppStatus[] = ["accepted", "rejected"];

// FR-08 control. The RPC + trigger handle validation/history server-side;
// accept/reject remains a human action — nothing here is automated.
// The select is CONTROLLED: React 19 resets uncontrolled form fields to
// their defaults after a form action completes, which made the selection
// visually snap back to the old status.
export function StatusChanger({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: AppStatus;
}) {
  const [state, formAction, pending] = useActionState<
    StatusChangeState,
    FormData
  >(changeApplicationStatus.bind(null, applicationId), {
    changed: false,
    error: null,
  });
  const [selected, setSelected] = useState<AppStatus>(currentStatus);
  const [prevStatus, setPrevStatus] = useState<AppStatus>(currentStatus);

  // Follow the authoritative status after revalidation (React's documented
  // "adjust state during render" pattern — no effect needed).
  if (prevStatus !== currentStatus) {
    setPrevStatus(currentStatus);
    setSelected(currentStatus);
  }

  const t = ar.application.statusChange;
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <form
      ref={formRef}
      action={formAction}
      // React skips the action when submit is prevented, so the dialog
      // stands between the click and the RPC; confirming resubmits once.
      onSubmit={(event) => {
        if (CONFIRMED.includes(selected) && !confirmed.current) {
          event.preventDefault();
          setConfirmOpen(true);
          return;
        }
        confirmed.current = false;
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">{t.newStatus}</Label>
          <select
            id="status"
            name="status"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value as AppStatus)}
            className={selectClass}
          >
            {APP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ar.status[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="note">{t.noteLabel}</Label>
          <Textarea id="note" name="note" rows={2} maxLength={1000} />
        </div>
        {selected === "rejected" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="rejection_reason">{t.reasonLabel}</Label>
            <select
              id="rejection_reason"
              name="rejection_reason"
              defaultValue=""
              className={selectClass}
            >
              <option value="">{t.reasonNone}</option>
              {REJECTION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t.reasons[reason]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t.reasonHint}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t.emailHint}</p>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={pending || selected === currentStatus}
        >
          {pending ? t.updating : t.submit}
        </Button>
        {state.changed && !pending && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {t.updated}
          </span>
        )}
        {state.error && !pending && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmBody.replace("{status}", ar.status[selected])}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant={selected === "rejected" ? "destructive" : "default"}
              onClick={() => {
                confirmed.current = true;
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              {t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
