"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  Briefcase,
  CalendarDays,
  ChartColumn,
  CreditCard,
  House,
  Loader2,
  MessagesSquare,
  Plus,
  Search,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { searchWorkspace, type WorkspaceSearchResult } from "@/app/(dashboard)/admin/search-actions";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  group: "applicants" | "jobs" | "commands";
  label: string;
  detail?: string;
  code?: string;
  href: string;
  icon: LucideIcon;
};

// The command palette (P4g): Ctrl/⌘ K anywhere in the workspace. Commands
// are local and instant; applicants (name, email, tracking code) and jobs
// come from search_workspace (0027), scoped to the active organization on
// the server. Opening an applicant pushes their URL, which the @panel slot
// intercepts, so they open in the side panel over the current page.
export function CommandPalette({ canWrite, canAdmin }: { canWrite: boolean; canAdmin: boolean }) {
  const t = ar.palette;
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<Extract<WorkspaceSearchResult, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced, and only the newest answer is kept: a slow reply to "ري"
  // must not overwrite the reply to "ريم".
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const request = ++latest.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchWorkspace(q);
        if (request !== latest.current) return;
        if (result.ok) {
          setRecords(result);
          setFailed(false);
        } else {
          setRecords(null);
          setFailed(true);
        }
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const commands: Item[] = [
    ...(canWrite ? [{ id: "new-job", label: t.commands.newJob, href: "/admin/jobs/new", icon: Plus }] : []),
    { id: "today", label: ar.shell.today, href: "/admin", icon: House },
    { id: "jobs", label: ar.admin.jobs, href: "/admin/jobs", icon: Briefcase },
    { id: "candidates", label: ar.candidates.title, href: "/admin/candidates", icon: Users },
    { id: "interviews", label: ar.interviewsHub.title, href: "/admin/interviews", icon: MessagesSquare },
    { id: "calendar", label: ar.calendar.title, href: "/admin/calendar", icon: CalendarDays },
    { id: "stats", label: ar.admin.stats, href: "/admin/stats", icon: ChartColumn },
    { id: "billing", label: ar.shell.billing, href: "/admin/billing", icon: CreditCard },
    ...(canAdmin
      ? [
          { id: "settings", label: ar.admin.settings, href: "/admin/settings", icon: Settings },
          { id: "team", label: ar.settingsPage.tabs.team, href: "/admin/settings?tab=team", icon: Users },
        ]
      : []),
  ].map((command) => ({ ...command, group: "commands" as const }));

  const q = query.trim();
  const searching = q.length >= 2;
  const items: Item[] = [
    ...(searching && records
      ? [
          ...records.applicants.map((a) => ({
            id: `a-${a.id}`,
            group: "applicants" as const,
            label: a.full_name,
            detail: `${a.job_title} · ${ar.status[a.status]}`,
            code: a.ref_code,
            href: `/admin/applications/${a.id}`,
            icon: UserRound,
          })),
          ...records.jobs.map((j) => ({
            id: `j-${j.id}`,
            group: "jobs" as const,
            label: j.title,
            detail: ar.adminJobs.statusLabels[j.status],
            href: `/admin/jobs/${j.id}/applicants`,
            icon: Briefcase,
          })),
        ]
      : []),
    ...commands.filter((c) => !q || c.label.includes(q)),
  ];
  const safeActive = Math.min(active, Math.max(items.length - 1, 0));

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    setRecords(null);
    router.push(item.href);
  }

  const groupLabel: Record<Item["group"], string> = {
    applicants: t.groups.applicants,
    jobs: t.groups.jobs,
    commands: t.groups.commands,
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Trigger className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-soft focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none max-sm:size-9 max-sm:justify-center max-sm:px-0">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate max-sm:sr-only">{t.trigger}</span>
        <kbd dir="ltr" className="ms-4 hidden rounded-sm border bg-surface-soft px-1.5 font-mono text-[0.7rem] text-muted-foreground lg:inline">
          Ctrl K
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          initialFocus={inputRef}
          className="fixed start-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[min(36rem,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-raised outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 rtl:translate-x-1/2"
        >
          <Dialog.Title className="sr-only">{t.title}</Dialog.Title>
          <div className="flex items-center gap-2 border-b px-3">
            {pending ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items[safeActive] ? `${listId}-${items[safeActive].id}` : undefined}
              aria-label={t.title}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => (items.length ? (i + 1) % items.length : 0));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(items[safeActive]);
                }
              }}
              placeholder={t.placeholder}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul id={listId} role="listbox" aria-label={t.title} className="overflow-y-auto p-1.5">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {pending ? t.searching : t.empty}
              </li>
            )}
            {items.map((item, index) => {
              const first = index === 0 || items[index - 1]!.group !== item.group;
              return (
                <li key={item.id} role="presentation">
                  {first && (
                    <p role="presentation" className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {groupLabel[item.group]}
                    </p>
                  )}
                  <div
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={index === safeActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm",
                      index === safeActive && "bg-surface-soft"
                    )}
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{item.label}</span>
                      {item.detail && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
                    </span>
                    {item.code && (
                      <bdi dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">
                        {item.code}
                      </bdi>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {failed && searching && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.unavailable}</p>
          )}
          <p className="flex flex-wrap gap-x-4 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{t.hints.move}</span>
            <span>{t.hints.open}</span>
            <span>{t.hints.close}</span>
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
