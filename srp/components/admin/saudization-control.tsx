"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setSaudizationCounting } from "@/app/(dashboard)/admin/applications/actions";
import { ar } from "@/lib/i18n/ar";

// Shown only once an application reaches interview or offer. Three states,
// not two: "not recorded" has to stay distinguishable from "no", or an
// unanswered question quietly becomes an answer.
export function SaudizationControl({
  applicationId,
  value,
}: {
  applicationId: string;
  value: boolean | null;
}) {
  const [current, setCurrent] = useState<boolean | null>(value);
  const [pending, startTransition] = useTransition();
  const t = ar.saudization;

  const set = (next: boolean | null) => {
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const res = await setSaudizationCounting(applicationId, next);
      if (!res.ok) setCurrent(previous);
    });
  };

  const options: { label: string; value: boolean | null }[] = [
    { label: t.countsYes, value: true },
    { label: t.countsNo, value: false },
    { label: t.countsUnset, value: null },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <span className="text-sm font-medium">{t.countsQuestion}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            size="sm"
            variant={current === option.value ? "default" : "outline"}
            disabled={pending}
            onClick={() => set(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t.countsHint}</p>
    </div>
  );
}
