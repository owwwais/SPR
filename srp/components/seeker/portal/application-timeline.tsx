import { CircleCheck } from "lucide-react";
import { ar } from "@/lib/i18n/ar";
import { formatDateTime } from "@/lib/format";
import type { AppStatus } from "@/types/database";

export type HistoryEntry = { to_status: AppStatus; created_at: string };

const STATUSES: AppStatus[] = [
  "new",
  "under_review",
  "interview",
  "accepted",
  "rejected",
];

// my_applications() returns history as jsonb. It is read defensively: an
// entry that does not have the expected shape is skipped rather than
// rendered as "undefined".
export function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { to_status, created_at } = item as Record<string, unknown>;
    if (
      typeof to_status === "string" &&
      (STATUSES as string[]).includes(to_status) &&
      typeof created_at === "string"
    ) {
      out.push({ to_status: to_status as AppStatus, created_at });
    }
  }
  return out;
}

// Statuses and their timestamps only — the same facts the public tracking
// page shows a guest (FR-08). Notes, scores and reasons never reach here.
export function ApplicationTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3 border-s border-input ps-5">
      {history.map((entry, i) => (
        <li key={`${entry.created_at}-${i}`} className="relative flex flex-col">
          {/* Centred on the rule: the list's padding (1.25rem) + half the
              icon (0.5rem) + half the 1px border. */}
          <CircleCheck
            className="absolute -start-[calc(1.75rem+0.5px)] top-0.5 size-4 bg-card text-primary"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="text-sm font-medium">{ar.status[entry.to_status]}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(entry.created_at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
