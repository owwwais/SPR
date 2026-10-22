"use client";

import { useId, useState, useTransition } from "react";
import { Check, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  editInterviewBank,
  editJobBank,
  type InterviewActionResult,
} from "@/app/(dashboard)/admin/interviews/actions";
import type {
  BankEdit,
  BankQuestionView,
  QuestionContent,
} from "@/lib/interviews";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";
import { difficultyLabel, effective, fill, formatSeconds } from "./helpers";

/** Which review a card belongs to: a job's core bank or one interview's gap probes. */
export type ReviewTarget =
  | { kind: "job"; bankId: string }
  | { kind: "interview"; assignmentId: string };

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  removed: "secondary",
} as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35";

function send(target: ReviewTarget, edit: BankEdit): Promise<InterviewActionResult> {
  return target.kind === "job"
    ? editJobBank(target.bankId, edit)
    : editInterviewBank(target.assignmentId, edit);
}

// One generated question. Staff see what the interviewer will use (their own
// version when they edited it), and can always open what the model produced:
// the original is never overwritten (§10.6 applied to questions).
export function QuestionCard({
  question,
  number,
  target,
  canEdit,
  regenerationsLeft,
}: {
  question: BankQuestionView;
  number: number;
  target: ReviewTarget;
  /** false for viewers and for locked banks: the card is read-only. */
  canEdit: boolean;
  regenerationsLeft: number;
}) {
  const t = ar.interviewBank.question;
  const content = effective(question);
  const removed = question.status === "removed";
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [regenerating, setRegenerating] = useState(false);

  // The label is chosen before the transition starts: a state update made
  // inside an async transition is held until the action ends, so setting it
  // there showed "saving" for the whole of a regeneration. It is read only
  // while `pending`, so it needs no reset.
  const run = (edit: BankEdit, onDone?: () => void) => {
    setError(null);
    setRegenerating(edit.op === "regenerate");
    startTransition(async () => {
      const result = await send(target, edit);
      if (result.ok) onDone?.();
      else setError(result.error);
    });
  };

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        removed && "bg-surface-soft"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted-foreground tabular-nums">{number}.</span>
        <Badge variant="outline">{ar.interviewBank.kinds[content.kind]}</Badge>
        <Badge variant={STATUS_VARIANT[question.status]}>
          {ar.interviewBank.questionStatuses[question.status]}
        </Badge>
        {question.edited && <Badge variant="default">{t.edited}</Badge>}
        {question.replaces && <Badge variant="secondary">{t.replacement}</Badge>}
      </div>

      <p
        className={cn(
          "leading-relaxed font-medium",
          removed && "text-muted-foreground line-through"
        )}
      >
        {content.text_ar}
      </p>

      <ContentDetails content={content} />

      {question.edited && (
        <details className="rounded-md border border-dashed px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t.showOriginal}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t.original}</span>
            <p className="leading-relaxed">{question.original.text_ar}</p>
            <ContentDetails content={question.original} withRubric={false} />
          </div>
        </details>
      )}

      {canEdit && !editing && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {removed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run({ op: "restore", question_id: question.id })}
            >
              <RotateCcw aria-hidden />
              {t.restore}
            </Button>
          ) : (
            <>
              {question.status === "pending" && (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => run({ op: "approve", question_id: question.id })}
                >
                  <Check aria-hidden />
                  {t.approve}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
                {t.edit}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || regenerationsLeft === 0}
                onClick={() => run({ op: "regenerate", question_id: question.id })}
              >
                <Sparkles aria-hidden />
                {t.regenerate}
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({fill(t.regenerationsLeft, { n: regenerationsLeft })})
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run({ op: "remove", question_id: question.id })}
              >
                <Trash2 aria-hidden />
                {t.remove}
              </Button>
            </>
          )}
          {pending && (
            <span role="status" className="text-sm text-muted-foreground">
              {regenerating ? t.regenerating : t.working}
            </span>
          )}
        </div>
      )}

      {canEdit && editing && (
        <EditForm
          content={content}
          pending={pending}
          onCancel={() => {
            setError(null);
            setEditing(false);
          }}
          onSave={(next) =>
            run({ op: "edit", question_id: question.id, content: next }, () =>
              setEditing(false)
            )
          }
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function ContentDetails({
  content,
  withRubric = true,
}: {
  content: QuestionContent;
  withRubric?: boolean;
}) {
  const t = ar.interviewBank.question;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t.competency}:</dt>
          <dd>{content.competency}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t.difficulty}:</dt>
          <dd>{difficultyLabel(content.difficulty)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t.timeLimit}:</dt>
          <dd className="tabular-nums">{formatSeconds(content.time_limit_sec)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t.followUp}:</dt>
          <dd>{ar.interviewBank.followUp[content.follow_up_policy]}</dd>
        </div>
      </dl>

      <div>
        <h4 className="mb-1 text-muted-foreground">{t.expectedPoints}</h4>
        <ul className="flex list-disc flex-col gap-1 ps-5">
          {content.expected_points.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      </div>

      {withRubric &&
        (content.kind === "warmup" ? (
          <p className="text-muted-foreground">{t.unscored}</p>
        ) : (
          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-muted-foreground">
              {t.rubric} ({content.rubric.criteria.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {content.rubric.criteria.map((criterion, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="font-medium">
                    {criterion.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      ({fill(t.weight, { n: criterion.weight })})
                    </span>
                  </span>
                  <dl className="grid gap-1 text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 font-medium text-success">{t.excellent}:</dt>
                      <dd>{criterion.excellent}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 font-medium text-warning">{t.acceptable}:</dt>
                      <dd>{criterion.acceptable}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 font-medium text-destructive">{t.weak}:</dt>
                      <dd>{criterion.weak}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}

// Text, competency, difficulty, expected points and time limit. The kind,
// the rubric and the follow-up policy are kept exactly as they were, so an
// edit can never turn a scored question into an unscored one.
function EditForm({
  content,
  pending,
  onSave,
  onCancel,
}: {
  content: QuestionContent;
  pending: boolean;
  onSave: (next: QuestionContent) => void;
  onCancel: () => void;
}) {
  const t = ar.interviewBank.editForm;
  // Several cards can be open for editing at once; ids must stay unique.
  const uid = useId();
  const [text, setText] = useState(content.text_ar);
  const [competency, setCompetency] = useState(content.competency);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(content.difficulty);
  const [points, setPoints] = useState(content.expected_points.join("\n"));
  const [timeLimit, setTimeLimit] = useState(
    content.time_limit_sec === null ? "" : String(content.time_limit_sec)
  );

  return (
    <form
      className="flex flex-col gap-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const seconds = timeLimit.trim() === "" ? null : Number(timeLimit);
        onSave({
          ...content,
          text_ar: text.trim(),
          competency: competency.trim(),
          difficulty,
          expected_points: points
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          time_limit_sec: seconds,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-text`}>{t.text}</Label>
        <Textarea
          id={`${uid}-text`}
          rows={3}
          required
          minLength={8}
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-competency`}>{t.competency}</Label>
          <Input
            id={`${uid}-competency`}
            required
            maxLength={120}
            value={competency}
            onChange={(e) => setCompetency(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-difficulty`}>{t.difficulty}</Label>
          <select
            id={`${uid}-difficulty`}
            className={selectClass}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3)}
          >
            {([1, 2, 3] as const).map((level) => (
              <option key={level} value={level}>
                {difficultyLabel(level)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-points`}>{t.expectedPoints}</Label>
        <Textarea
          id={`${uid}-points`}
          rows={4}
          required
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={`${uid}-time`}>{t.timeLimit}</Label>
        <Input
          id={`${uid}-time`}
          type="number"
          inputMode="numeric"
          dir="ltr"
          className="text-start tabular-nums"
          min={30}
          max={1200}
          step={1}
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.rubricKept}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Check aria-hidden />
          {pending ? ar.interviewBank.question.working : t.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
