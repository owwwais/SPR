import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ar } from "@/lib/i18n/ar";
import type { AnalysisStatus, AppStatus } from "@/types/database";

// An application's status as the seeker sees it: the same five words the
// public tracking page uses (FR-08), tinted by meaning. A refusal is shown
// calmly in the neutral tone, not in alarm red — it is news, not an error.
const STATUS_VARIANT: Record<
  AppStatus,
  "secondary" | "default" | "success" | "outline"
> = {
  new: "secondary",
  under_review: "default",
  interview: "default",
  accepted: "success",
  rejected: "outline",
};

export function ApplicationStatusBadge({ status }: { status: AppStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{ar.status[status]}</Badge>;
}

// The state of the CV analysis behind the profile. Running states spin only
// for people who have not asked for reduced motion (DESIGN.md A10).
export function AnalysisBadge({ status }: { status: AnalysisStatus }) {
  const t = ar.seekerPortal.analysis;
  if (status === "done") {
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden />
        {t.done}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <CircleAlert aria-hidden />
        {t.failed}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="motion-safe:animate-spin" aria-hidden />
      {status === "processing" ? t.processing : t.pending}
    </Badge>
  );
}

export function fileTypeLabel(mime: string): string {
  return mime === "application/pdf"
    ? ar.seekerPortal.fileTypes.pdf
    : ar.seekerPortal.fileTypes.docx;
}
