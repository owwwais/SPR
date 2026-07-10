"use client";

import { useActionState, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveInterview,
  type InterviewState,
} from "@/app/(dashboard)/admin/applications/actions";
import type { InterviewQaEntryType } from "@/lib/validations/screening";
import { ar } from "@/lib/i18n/ar";

// Interview management (engineer extension, 2026-07-10): schedule the
// interview and record answers against the AI-suggested questions — or add
// new HR questions with their answers. Saved to applications.interview_qa;
// a subsequent "إعادة التحليل" feeds the record back into the evaluation.

function mergeEntries(
  initialQa: InterviewQaEntryType[],
  aiQuestions: string[]
): InterviewQaEntryType[] {
  const existing = new Set(initialQa.map((e) => e.question));
  return [
    ...initialQa,
    ...aiQuestions
      .filter((q) => !existing.has(q))
      .map((q) => ({ question: q, answer: "", source: "ai" as const })),
  ];
}

export function InterviewManager({
  applicationId,
  aiQuestions,
  initialQa,
  initialAt,
}: {
  applicationId: string;
  aiQuestions: string[];
  initialQa: InterviewQaEntryType[];
  initialAt: string | null;
}) {
  const t = ar.interview;
  const [entries, setEntries] = useState<InterviewQaEntryType[]>(() =>
    mergeEntries(initialQa, aiQuestions)
  );
  const [scheduledAt, setScheduledAt] = useState(() =>
    initialAt ? format(new Date(initialAt), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [newQuestion, setNewQuestion] = useState("");
  const [state, formAction, pending] = useActionState<InterviewState, FormData>(
    saveInterview.bind(null, applicationId),
    { saved: false, error: null }
  );

  const updateAnswer = (index: number, answer: string) =>
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, answer } : entry))
    );

  // Persist entries that carry an answer, plus HR questions even when they
  // are still unanswered (planned questions). Unanswered AI suggestions are
  // not stored — they always re-merge from the evaluation.
  const serialized = JSON.stringify(
    entries.filter(
      (entry) => entry.answer.trim().length > 0 || entry.source === "hr"
    )
  );
  const scheduledIso = scheduledAt
    ? new Date(scheduledAt).toISOString()
    : "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="interview_qa" value={serialized} />
      <input type="hidden" name="interview_at_iso" value={scheduledIso} />

      <p className="text-sm text-muted-foreground">{t.manageHint}</p>

      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor="interview_at" className="flex items-center gap-1.5">
          <CalendarClock className="size-4" aria-hidden />
          {t.scheduleLabel}
        </Label>
        <Input
          id="interview_at"
          type="datetime-local"
          dir="ltr"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li
            key={`${entry.source}-${entry.question}`}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                {index + 1}. {entry.question}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={entry.source === "ai" ? "secondary" : "outline"}>
                  {entry.source === "ai" ? t.aiBadge : t.hrBadge}
                </Badge>
                {entry.source === "hr" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t.remove}
                    onClick={() =>
                      setEntries((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                    <span className="sr-only">{t.remove}</span>
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              rows={2}
              maxLength={4000}
              placeholder={t.answerPlaceholder}
              value={entry.answer}
              onChange={(e) => updateAnswer(index, e.target.value)}
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
        <Label htmlFor="new-question">{t.newQuestionLabel}</Label>
        <div className="flex gap-2">
          <Input
            id="new-question"
            value={newQuestion}
            maxLength={500}
            placeholder={t.newQuestionPlaceholder}
            onChange={(e) => setNewQuestion(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={newQuestion.trim().length === 0 || entries.length >= 30}
            onClick={() => {
              setEntries((prev) => [
                ...prev,
                { question: newQuestion.trim(), answer: "", source: "hr" },
              ]);
              setNewQuestion("");
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t.addQa}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {state.saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" aria-hidden />
            {t.saved}
          </span>
        )}
        {state.error && !pending && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}
