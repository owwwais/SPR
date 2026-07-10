import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// FR-04 color bands: >=75 green, 50-74 amber, <50 red.
export function scoreBandClass(score: number): string {
  if (score >= 75)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 50)
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
}

// FR-06: the score is always presented as advisory (§10.4) — the tooltip
// and the visible "استشاري" affix must survive any redesign.
export function ScoreBadge({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  return (
    <span
      title={ar.evaluation.advisoryTooltip}
      className={cn(
        "inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 font-semibold tabular-nums",
        scoreBandClass(score),
        className
      )}
    >
      {score}
      <span className="text-[10px] font-normal opacity-75">
        {ar.evaluation.advisory}
      </span>
    </span>
  );
}
