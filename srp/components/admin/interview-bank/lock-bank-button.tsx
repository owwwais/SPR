"use client";

import { Lock } from "lucide-react";
import { lockJobBank } from "@/app/(dashboard)/admin/interviews/actions";
import { ar } from "@/lib/i18n/ar";
import { ConfirmButton } from "./confirm-button";

// Locking is final for this version: the agent fingerprints the approved
// questions and refuses any later change to them (design §4.3).
export function LockBankButton({
  bankId,
  disabled,
}: {
  bankId: string;
  disabled: boolean;
}) {
  const t = ar.interviewBank.review;
  return (
    <ConfirmButton
      label={t.lock}
      pendingLabel={t.locking}
      dialog={t.lockDialog}
      disabled={disabled}
      icon={<Lock aria-hidden />}
      onConfirm={() => lockJobBank(bankId)}
    />
  );
}
