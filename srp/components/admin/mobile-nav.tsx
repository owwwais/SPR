"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Briefcase, House, Menu, Users, X } from "lucide-react";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";

// The phone shell (P4b, UI-A4): the full sidebar lives in a drawer from the
// start edge, and a tab bar at the bottom keeps the four most-used places one
// tap away. Top bar 48px + tab bar 56px keeps the frame under 110px, where
// the old stacked sidebar took 214px of an 844px screen.

// One drawer, opened from the top bar and from "المزيد" (detached triggers).
const navDrawer = Dialog.createHandle();

export function MobileNavTrigger() {
  return (
    <Dialog.Trigger
      handle={navDrawer}
      className="-ms-2 flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-soft focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none md:hidden"
    >
      <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{ar.shell.menu}</span>
    </Dialog.Trigger>
  );
}

export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Open only on the path it was opened from: a link inside the drawer
  // navigates, and the drawer must not stay over the page it just opened.
  const [openedOn, setOpenedOn] = useState<string | null>(null);

  return (
    <Dialog.Root
      handle={navDrawer}
      open={openedOn === pathname}
      onOpenChange={(next) => setOpenedOn(next ? pathname : null)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/25 transition-opacity duration-240 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none md:hidden" />
        <Dialog.Popup className="fixed inset-y-0 start-0 z-50 flex w-[min(20rem,86vw)] flex-col overflow-y-auto overscroll-contain border-e bg-sidebar shadow-raised outline-none transition-transform duration-240 ease-out data-ending-style:ltr:-translate-x-full data-ending-style:rtl:translate-x-full data-starting-style:ltr:-translate-x-full data-starting-style:rtl:translate-x-full motion-reduce:transition-none md:hidden">
          <Dialog.Title className="sr-only">{ar.shell.menu}</Dialog.Title>
          <Dialog.Close className="absolute end-2 top-2 flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-sunken/70 focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none">
            <X className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{ar.shell.closeMenu}</span>
          </Dialog.Close>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const TABS = [
  { href: "/admin", exact: true, label: ar.shell.today, icon: House },
  { href: "/admin/jobs", exact: false, label: ar.admin.jobs, icon: Briefcase },
  { href: "/admin/candidates", exact: false, label: ar.candidates.title, icon: Users },
] as const;

const tabClass =
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[0.7rem] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none";

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ar.shell.primaryNav}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-14 items-stretch gap-1 px-2 py-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-primary" : "text-muted-foreground")}
              >
                <tab.icon className="size-5" strokeWidth={1.75} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <Dialog.Trigger handle={navDrawer} className={cn(tabClass, "text-muted-foreground")}>
            <Menu className="size-5" strokeWidth={1.75} aria-hidden />
            {ar.shell.more}
          </Dialog.Trigger>
        </li>
      </ul>
    </nav>
  );
}
