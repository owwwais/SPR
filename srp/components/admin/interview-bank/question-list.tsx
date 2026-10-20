import type { BankQuestionView } from "@/lib/interviews";
import { ar } from "@/lib/i18n/ar";
import { groupQuestions } from "./helpers";
import { QuestionCard, type ReviewTarget } from "./question-card";

// Questions grouped by kind — warm-up, technical, behavioral + situational
// (one share of the mix), then gap probes — each group in position order,
// numbered continuously in the order an interviewer would read them.
// `headings={false}` drops the group titles where the surrounding section
// already names the only kind on show (an interview's gap probes).
export function QuestionList({
  questions,
  target,
  canEdit,
  regenerationsLeft,
  headings = true,
}: {
  questions: BankQuestionView[];
  target: ReviewTarget;
  canEdit: boolean;
  regenerationsLeft: number;
  headings?: boolean;
}) {
  const groups = groupQuestions(questions);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, groupIndex) => {
        const start = groups
          .slice(0, groupIndex)
          .reduce((count, previous) => count + previous.questions.length, 0);
        return (
          <section key={group.key} className="flex flex-col gap-3">
            {headings && (
              <h3 className="flex items-center gap-2 font-semibold">
                {ar.interviewBank.groups[group.key]}
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  ({group.questions.length})
                </span>
              </h3>
            )}
            <ol className="flex flex-col gap-3">
              {group.questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  number={start + index + 1}
                  target={target}
                  canEdit={canEdit}
                  regenerationsLeft={regenerationsLeft}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
