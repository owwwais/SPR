"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
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

// FR-07: the AI questions are read-only; HR's own edits and additions live
// in ai_evaluations.interview_notes, never over the original. The questions
// themselves are listed once, in InterviewManager (UI-F11); this is only the
// notes field.
export function InterviewNotes({
  applicationId,
  initialNotes,
}: {
  applicationId: string;
  initialNotes: string;
}) {
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

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="interview_notes">{t.notesLabel}</Label>
      <p className="text-xs text-muted-foreground">{t.notesHint}</p>
      <Textarea
        id="interview_notes"
        name="interview_notes"
        rows={4}
        maxLength={4000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t.notesPlaceholder}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? t.savingNotes : t.saveNotes}
        </Button>
        {state.saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {t.notesSaved}
          </span>
        )}
        {state.error && !pending && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}
