"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Check, Copy, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveInterview,
  type InterviewState,
} from "@/app/(dashboard)/admin/applications/actions";
import type { InterviewQaEntryType } from "@/lib/validations/screening";
import type { InterviewQuestion } from "@/components/admin/interview-questions";
import { formatClock, riyadhDayKey } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";

// Quarter hours, 24-hour clock: the interview time picker.
const TIMES = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`
);

// Interview management (engineer extension, 2026-07-10): schedule the
// interview and record answers against the AI-suggested questions — or add
// new HR questions with their answers. Saved to applications.interview_qa;
// a subsequent "إعادة التحليل" feeds the record back into the evaluation.
// Since P4c this is the one place the suggested questions appear (UI-F11):
// each keeps its type and rationale (FR-07), read-only, beside its answer.
// The time is Riyadh wall time on both server and client, so the first
// render and hydration agree and the stored instant is the one HR meant.

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
  aiQuestions: InterviewQuestion[];
  initialQa: InterviewQaEntryType[];
  initialAt: string | null;
}) {
  const t = ar.interview;
  const te = ar.evaluation;
  const [entries, setEntries] = useState<InterviewQaEntryType[]>(() =>
    mergeEntries(initialQa, aiQuestions.map((q) => q.question))
  );
  const byQuestion = new Map(aiQuestions.map((q) => [q.question, q]));
  const [date, setDate] = useState(() => (initialAt ? riyadhDayKey(initialAt) : ""));
  const [time, setTime] = useState(() => (initialAt ? formatClock(initialAt) : "10:00"));
  const [copied, setCopied] = useState(false);
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
  const scheduledIso = date ? new Date(`${date}T${time}:00+03:00`).toISOString() : "";

  const copyAll = async () => {
    await navigator.clipboard.writeText(
      entries.map((entry, i) => `${i + 1}. ${entry.question}`).join("\n")
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="interview_qa" value={serialized} />
      <input type="hidden" name="interview_at_iso" value={scheduledIso} />

      <p className="text-sm text-muted-foreground">{t.manageHint}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interview_at" className="flex items-center gap-1.5">
          <CalendarClock className="size-4" aria-hidden />
          {t.scheduleLabel}
        </Label>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <DateField id="interview_at" defaultValue={date || null} onValueChange={setDate} />
          </div>
          <select
            aria-label={t.timeLabel}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm tabular-nums outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            {(TIMES.includes(time) ? TIMES : [...TIMES, time].sort()).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{t.timeZoneNote}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{te.questionsTitle}</h4>
        <Button type="button" variant="outline" size="sm" onClick={copyAll}>
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? te.copied : te.copyAll}
        </Button>
      </div>

      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => {
          const suggested = entry.source === "ai" ? byQuestion.get(entry.question) : undefined;
          return (
          <li
            key={`${entry.source}-${entry.question}`}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {index + 1}. {entry.question}
                </p>
                {suggested && (
                  <p className="text-sm text-muted-foreground">{suggested.rationale}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={entry.source === "ai" ? "secondary" : "outline"}>
                  {suggested ? te.questionKinds[suggested.kind] : entry.source === "ai" ? t.aiBadge : t.hrBadge}
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
          );
        })}
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
          <span className="flex items-center gap-1 text-sm text-success">
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
