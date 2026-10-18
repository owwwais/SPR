"use client";

import { Lock, X } from "lucide-react";
import {
  cancelVirtualInterview,
  lockInterviewBank,
} from "@/app/(dashboard)/admin/interviews/actions";
import { ConfirmButton } from "@/components/admin/interview-bank/confirm-button";
import { ar } from "@/lib/i18n/ar";

// Both are final: a cancelled interview cannot resume, and locked questions
// never change (the plan is fingerprinted at lock). Each asks first.

export function CancelInterviewButton({ assignmentId }: { assignmentId: string }) {
  const t = ar.interviewBank.panel;
  return (
    <ConfirmButton
      label={t.cancel}
      pendingLabel={t.cancelling}
      dialog={t.cancelDialog}
      variant="destructive"
      icon={<X aria-hidden />}
      onConfirm={() => cancelVirtualInterview(assignmentId)}
    />
  );
}

export function LockInterviewButton({
  assignmentId,
  disabled,
}: {
  assignmentId: string;
  disabled: boolean;
}) {
  const t = ar.interviewBank.panel.review;
  return (
    <ConfirmButton
      label={t.lock}
      pendingLabel={t.locking}
      dialog={t.lockDialog}
      disabled={disabled}
      icon={<Lock aria-hidden />}
      onConfirm={() => lockInterviewBank(assignmentId)}
    />
  );
}
