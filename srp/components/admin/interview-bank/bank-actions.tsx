"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateJobBank,
  retryJobBank,
} from "@/app/(dashboard)/admin/interviews/actions";
import { ar } from "@/lib/i18n/ar";

// The two actions that START a generation (and may therefore cost a model
// call). The server re-checks the role, the organization and the plan; these
// buttons are only rendered for staff who can write.

export function GenerateBankButton({
  jobId,
  label,
  variant = "default",
}: {
  jobId: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await generateJobBank(jobId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        <Sparkles className="size-4" aria-hidden />
        {pending ? ar.interviewBank.requesting : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RetryBankButton({ bankId }: { bankId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await retryJobBank(bankId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        <RefreshCw className="size-4" aria-hidden />
        {pending ? ar.interviewBank.requesting : ar.interviewBank.failed.retry}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
