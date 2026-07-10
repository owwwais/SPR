"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTION_TYPES,
  type QuestionType,
  type ScreeningQuestionType,
} from "@/lib/validations/screening";
import { ar } from "@/lib/i18n/ar";

// Builder for jobs.screening_questions. Serializes its state into a hidden
// field so the plain server-action form submission carries it (no extra
// client fetch).

type DraftQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  optionsText: string;
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function toDraft(questions: ScreeningQuestionType[]): DraftQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    label: q.label,
    type: q.type,
    required: q.required,
    optionsText: q.options.join("\n"),
  }));
}

function serialize(drafts: DraftQuestion[]): string {
  return JSON.stringify(
    drafts.map((d) => ({
      id: d.id,
      label: d.label.trim(),
      type: d.type,
      required: d.required,
      options:
        d.type === "single_choice" || d.type === "multiple_choice"
          ? d.optionsText
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean)
          : [],
    }))
  );
}

export function QuestionsBuilder({
  initialQuestions,
}: {
  initialQuestions: ScreeningQuestionType[];
}) {
  const [drafts, setDrafts] = useState<DraftQuestion[]>(
    toDraft(initialQuestions)
  );
  const t = ar.adminJobs.questions;

  const update = (id: string, patch: Partial<DraftQuestion>) =>
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4 sm:col-span-2">
      <legend className="px-2 text-sm font-semibold">{t.builderTitle}</legend>
      <p className="text-xs text-muted-foreground">{t.builderHint}</p>
      <input
        type="hidden"
        name="screening_questions"
        value={serialize(drafts)}
      />

      {drafts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}

      {drafts.map((draft, index) => (
        <div
          key={draft.id}
          className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              {index + 1}.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t.remove}
              onClick={() =>
                setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
              }
            >
              <Trash2 className="size-4 text-destructive" aria-hidden />
              <span className="sr-only">{t.remove}</span>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`q-label-${draft.id}`}>{t.questionLabel}</Label>
              <Input
                id={`q-label-${draft.id}`}
                value={draft.label}
                maxLength={300}
                onChange={(e) => update(draft.id, { label: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`q-type-${draft.id}`}>{t.questionType}</Label>
              <select
                id={`q-type-${draft.id}`}
                className={selectClass}
                value={draft.type}
                onChange={(e) =>
                  update(draft.id, { type: e.target.value as QuestionType })
                }
              >
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.types[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft.required}
                  onChange={(e) =>
                    update(draft.id, { required: e.target.checked })
                  }
                />
                {t.required}
              </label>
            </div>
            {(draft.type === "single_choice" ||
              draft.type === "multiple_choice") && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`q-options-${draft.id}`}>
                  {t.optionsLabel}
                </Label>
                <Textarea
                  id={`q-options-${draft.id}`}
                  rows={3}
                  placeholder={t.optionsPlaceholder}
                  value={draft.optionsText}
                  onChange={(e) =>
                    update(draft.id, { optionsText: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        </div>
      ))}

      {drafts.length < 10 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setDrafts((prev) => [
              ...prev,
              {
                id: crypto.randomUUID().slice(0, 8),
                label: "",
                type: "text",
                required: false,
                optionsText: "",
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          {t.addQuestion}
        </Button>
      )}
    </fieldset>
  );
}
