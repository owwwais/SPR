"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ClipboardList, Ellipsis, ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ar } from "@/lib/i18n/ar";

const itemClass =
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-sm px-2.5 text-sm outline-none select-none data-highlighted:bg-surface-soft";

// UI-C1/C3: a job row carried four buttons, with "delete" and "publish" the
// loudest things on the page. The row now has one contextual action; the
// rest live here. Deleting still asks first (soft delete, D9).
export function JobRowMenu({
  jobId,
  published,
  deleteAction,
}: {
  jobId: string;
  published: boolean;
  deleteAction: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const t = ar.adminJobs.menu;
  const c = ar.adminJobs.confirmDelete;

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={t.label}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-soft hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none data-popup-open:bg-surface-soft"
        >
          <Ellipsis className="size-4" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="end" className="z-50 outline-none">
            <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-raised outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
              <Menu.LinkItem render={<Link href={`/admin/jobs/${jobId}/edit`} />} className={itemClass}>
                <Pencil className="size-4 text-muted-foreground" aria-hidden />
                {t.edit}
              </Menu.LinkItem>
              <Menu.LinkItem
                render={<Link href={`/admin/jobs/${jobId}/interview-bank`} />}
                className={itemClass}
              >
                <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
                {t.interviewBank}
              </Menu.LinkItem>
              {published && (
                <Menu.LinkItem
                  render={<a href={`/jobs/${jobId}`} target="_blank" rel="noopener" />}
                  className={itemClass}
                >
                  <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
                  {t.viewPublic}
                </Menu.LinkItem>
              )}
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item onClick={() => setConfirmOpen(true)} className={`${itemClass} text-destructive`}>
                <Trash2 className="size-4" aria-hidden />
                {t.remove}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.title}</AlertDialogTitle>
            <AlertDialogDescription>{c.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <form action={deleteAction}>
              <AlertDialogAction type="submit" variant="destructive">
                {c.confirm}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
