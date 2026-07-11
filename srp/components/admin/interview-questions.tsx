"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveInterviewNotes,
  type NotesState,
} from "@/app/(dashboard)/admin/applications/actions";
import { ar } from "@/lib/i18n/ar";

export type InterviewQuestion = {
  question: string;
  kind: "technical" | "behavioral" | "gap_probe";
  rationale: string;
};

const kindVariant: Record<
  InterviewQuestion["kind"],
  "default" | "secondary" | "outline"
> = {
  technical: "default",
  behavioral: "secondary",
  gap_probe: "outline",
};

// FR-07: AI questions are read-only; HR edits live in interview_notes.
export function InterviewQuestions({
  applicationId,
  questions,
  initialNotes,
}: {
  applicationId: string;
  questions: InterviewQuestion[];
  initialNotes: string;
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<NotesState, FormData>(
    saveInterviewNotes.bind(null, applicationId),
    { saved: false, error: null }
  );
  // Controlled + render-synced with the server value (uncontrolled
  // defaultValue must not change after mount).
  const [notes, setNotes] = useState(initialNotes);
  const [prevNotes, setPrevNotes] = useState(initialNotes);
  if (prevNotes !== initialNotes) {
    setPrevNotes(initialNotes);
    setNotes(initialNotes);
  }
  const t = ar.evaluation;

  const copyAll = async () => {
    const text = questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t.questionsTitle}</h3>
        <Button type="button" variant="outline" size="sm" onClick={copyAll}>
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? t.copied : t.copyAll}
        </Button>
      </div>

      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                {i + 1}. {q.question}
              </p>
              <Badge variant={kindVariant[q.kind]} className="shrink-0">
                {t.questionKinds[q.kind]}
              </Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {q.rationale}
            </p>
          </li>
        ))}
      </ol>

      <form action={formAction} className="flex flex-col gap-2">
        <Label htmlFor="interview_notes">{t.notesLabel}</Label>
        <p className="text-xs text-muted-foreground">{t.notesHint}</p>
        <Textarea
          id="interview_notes"
          name="interview_notes"
          rows={5}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.notesPlaceholder}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t.savingNotes : t.saveNotes}
          </Button>
          {state.saved && !pending && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <Check className="size-4" aria-hidden />
              {t.notesSaved}
            </span>
          )}
          {state.error && !pending && (
            <span className="text-sm text-destructive">{state.error}</span>
          )}
        </div>
      </form>
    </div>
  );
}
