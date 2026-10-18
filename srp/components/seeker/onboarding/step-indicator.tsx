import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

export const ONBOARDING_STEPS = ["cv", "contact", "review", "consents"] as const;
export type IndicatorStep = (typeof ONBOARDING_STEPS)[number];

// The four steps of the CV-first onboarding (plan §2.3), always visible so
// the person knows how much is left (DESIGN.md §1: "progress always
// visible"). An ordered list in document order: in RTL the first step sits at
// the start edge on the right and the bars fill towards the left, with no
// direction-specific code.
export function StepIndicator({
  current,
  className,
}: {
  current: IndicatorStep;
  className?: string;
}) {
  const t = ar.seekerOnboarding.steps;
  const currentIndex = ONBOARDING_STEPS.indexOf(current);

  return (
    <nav aria-label={t.label} className={className}>
      <p className="sr-only">
        {t.progress
          .replace("{current}", String(currentIndex + 1))
          .replace("{total}", String(ONBOARDING_STEPS.length))}
      </p>
      <ol className="grid grid-cols-4 gap-2 sm:gap-3">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step}
              aria-current={active ? "step" : undefined}
              className="flex flex-col gap-2"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 rounded-sm",
                  done || active ? "bg-primary" : "bg-surface-sunken"
                )}
              />
              <span
                className={cn(
                  "flex items-start gap-1.5 text-xs leading-snug font-medium sm:items-center sm:text-sm",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold tabular-nums",
                    done && "bg-primary-soft text-primary-soft-foreground",
                    active && "bg-primary text-primary-foreground",
                    !done && !active && "bg-surface-soft text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={2.5} /> : index + 1}
                </span>
                <span className="min-w-0">{t[step]}</span>
                {done && <span className="sr-only">({t.completed})</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
