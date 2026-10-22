import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { AnalysisWatcher } from "@/components/seeker/onboarding/analysis-watcher";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import type { AnalysisStatus } from "@/types/database";

// The small live status shown above the contact form while the CV is read
// in the background. A failure is a caution, not an error: the person can
// finish this step, and the review step offers the re-upload.
export function AnalysisChip({ status }: { status: AnalysisStatus }) {
  const t = ar.seekerOnboarding.analysis;
  const running = status === "pending" || status === "processing";

  return (
    <div className="flex flex-col gap-1.5">
      <p
        role="status"
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-sm px-2.5 py-1 text-xs font-medium",
          running && "bg-primary-soft text-primary-soft-foreground",
          status === "done" && "bg-success-soft text-success",
          status === "failed" && "bg-warning-soft text-warning"
        )}
      >
        {running && (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        )}
        {status === "done" && <CheckCircle2 className="size-3.5" aria-hidden />}
        {status === "failed" && <AlertTriangle className="size-3.5" aria-hidden />}
        {running ? t.running : status === "done" ? t.done : t.failed}
      </p>
      <AnalysisWatcher active={running} />
    </div>
  );
}
