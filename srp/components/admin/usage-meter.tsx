"use client";

// Client component: Meter is one, and getAriaValueText is a function, which a
// Server Component cannot hand across the boundary.
import { Meter } from "@base-ui/react/meter";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// One plan limit as a bar (DESIGN.md §9 "Meter"). Teal while there is room,
// warning from 80%, danger when exhausted. A NULL limit has no ceiling and
// draws no bar; a 0 limit is "not in this plan", which is a different
// statement and says so.
export function UsageMeter({
  label,
  used,
  limit,
  compact = false,
}: {
  label: string;
  used: number;
  limit: number | null;
  compact?: boolean;
}) {
  const t = ar.billing.meter;

  if (limit === null) {
    return (
      <div className={cn("flex flex-col gap-1.5", compact && "gap-1")}>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">
            <bdi>{used}</bdi> · {t.unlimited}
          </span>
        </div>
      </div>
    );
  }

  if (limit === 0) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{t.notIncluded}</span>
      </div>
    );
  }

  const ratio = Math.min(used / limit, 1);
  const tone =
    ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-warning" : "bg-primary";

  return (
    <Meter.Root
      value={Math.min(used, limit)}
      max={limit}
      className={cn("grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5", compact && "gap-y-1")}
      getAriaValueText={() => `${used} ${t.of} ${limit}`}
    >
      <Meter.Label className="text-sm text-muted-foreground">{label}</Meter.Label>
      <span className={cn("text-sm tabular-nums", ratio >= 1 && "font-semibold text-destructive")}>
        <bdi>
          {used} {t.of} {limit}
        </bdi>
      </span>
      <Meter.Track
        className={cn(
          "col-span-2 overflow-hidden rounded-sm bg-surface-sunken",
          compact ? "h-1" : "h-1.5"
        )}
      >
        <Meter.Indicator className={cn("h-full rounded-sm", tone)} />
      </Meter.Track>
    </Meter.Root>
  );
}
