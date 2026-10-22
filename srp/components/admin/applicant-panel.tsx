"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { ar } from "@/lib/i18n/ar";

// The frame of the applicant side panel: from the end edge (the left in
// RTL), about 640px, the whole screen on a phone. Closing goes back, so the
// list underneath is exactly where it was — scroll position and filters.
export function ApplicantPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Dialog.Root open onOpenChange={(open) => !open && router.back()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/25 transition-opacity duration-240 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed inset-y-0 end-0 z-50 flex w-full flex-col overflow-y-auto overscroll-contain border-s bg-background shadow-raised outline-none transition-transform duration-240 ease-out data-ending-style:ltr:translate-x-full data-ending-style:rtl:-translate-x-full data-starting-style:ltr:translate-x-full data-starting-style:rtl:-translate-x-full motion-reduce:transition-none sm:w-[min(42rem,92vw)]">
          <Dialog.Title className="sr-only">{ar.application.title}</Dialog.Title>
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-end border-b bg-background px-3">
            <Dialog.Close className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-soft focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none">
              <X className="size-5" strokeWidth={1.75} aria-hidden />
              <span className="sr-only">{ar.applicants.closePanel}</span>
            </Dialog.Close>
          </div>
          <div className="p-4 sm:p-6">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
