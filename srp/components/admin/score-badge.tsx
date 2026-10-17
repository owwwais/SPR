import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// FR-04 color bands: >=75 green, 50-74 amber, <50 red — as semantic tokens,
// so the bands follow the theme instead of hard-coding a palette.
export function scoreBandClass(score: number): string {
  if (score >= 75) return "bg-success-soft text-success";
  if (score >= 50) return "bg-warning-soft text-warning";
  return "bg-destructive-soft text-destructive";
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
        "inline-flex items-baseline gap-1 rounded-sm px-2 py-0.5 font-bold tabular-nums",
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
