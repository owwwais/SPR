import Link from "next/link";
import { CircleAlert, Info, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { SERVICE_ICONS, type RunSummary } from "@/lib/services";
import { cn } from "@/lib/utils";
import type { ServiceKind } from "@/lib/validations/services";

const t = ar.services;

// One card section, the dossier's pattern: a hairline header and a body.
export function Panel({
  id,
  title,
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("flex min-w-0 flex-col rounded-xl border bg-card break-inside-avoid", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {actions && <div className="flex items-center gap-2 print:hidden">{actions}</div>}
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

export function Bullets({ items, className }: { items: readonly string[]; className?: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className={cn("flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed text-body marker:text-muted-soft", className)}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

// D24: every result says what it is, wherever it is shown.
export function AdvisoryBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary-soft-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">{t.advisory}.</span> {t.advisoryNote}
      </p>
    </div>
  );
}

export function ConfidenceNote({ level }: { level: "high" | "medium" | "low" }) {
  if (level === "high") return <Badge variant="success">{t.confidence.high}</Badge>;
  return (
    <p className="flex items-start gap-2 text-sm text-warning">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {t.confidence[level]}
    </p>
  );
}

export function StatusBadge({ status }: { status: RunSummary["status"] }) {
  const variant = status === "done" ? "success" : status === "failed" ? "destructive" : "secondary";
  return (
    <Badge variant={variant}>
      {status === "processing" && <Loader2 className="animate-spin" aria-hidden />}
      {t.statuses[status]}
    </Badge>
  );
}

export function RunList({ runs, showKind }: { runs: RunSummary[]; showKind?: boolean }) {
  return (
    <ul className="divide-y">
      {runs.map((run) => {
        const Icon = SERVICE_ICONS[run.kind as ServiceKind];
        return (
          <li key={run.id}>
            <Link
              href={`/admin/services/${run.kind}/${run.id}`}
              className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-soft"
            >
              {showKind && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{run.title}</span>
                <span className="text-xs text-muted-foreground">
                  {showKind && <>{t.kinds[run.kind as ServiceKind].title} · </>}
                  {formatDateTime(run.created_at)}
                </span>
              </span>
              <StatusBadge status={run.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
