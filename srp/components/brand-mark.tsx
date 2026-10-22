import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// The product mark: the scale in a teal tile beside the name. One component
// so the header, footer and every auth page show the same mark, and the name
// still comes only from ar.ts (D25).
export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 font-display font-bold",
        size === "md" ? "text-lg" : "text-base",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-md bg-primary text-primary-foreground",
          size === "md" ? "size-8" : "size-7"
        )}
      >
        <Scale
          className={size === "md" ? "size-4" : "size-3.5"}
          strokeWidth={2}
          aria-hidden
        />
      </span>
      <span>{ar.common.appName}</span>
    </span>
  );
}
