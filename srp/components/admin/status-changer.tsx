"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
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

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="font-semibold">{t.title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
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
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" aria-hidden />
            {t.updated}
          </span>
        )}
        {state.error && !pending && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}
