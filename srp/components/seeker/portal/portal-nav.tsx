"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Building2, LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const t = ar.seekerPortal.nav;

const LINKS = [
  { href: "/me", label: t.home, exact: true },
  { href: "/me/jobs", label: t.jobs, exact: false },
  { href: "/me/applications", label: t.applications, exact: false },
  { href: "/me/profile", label: t.profile, exact: false },
  { href: "/me/settings", label: t.settings, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

// The seeker portal's header navigation. Desktop shows the links inline;
// below md the same links sit in a native <details> disclosure, the pattern
// the public header uses — keyboard- and screen-reader-operable with no
// extra state. It closes itself after a navigation, since the layout (and
// so the open disclosure) survives client-side page changes.
export function PortalNav({ showCompanyLink }: { showCompanyLink: boolean }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  return (
    <>
      <nav aria-label={t.label} className="hidden items-center gap-1 md:flex">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                active
                  ? "bg-primary-soft font-medium text-primary-soft-foreground"
                  : "text-muted-foreground hover:bg-surface-soft hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="ms-auto flex items-center gap-2">
        {showCompanyLink && (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<Link href="/admin" />}
          >
            <Building2 aria-hidden />
            {t.companyWorkspace}
          </Button>
        )}
        <form action={signOut} className="hidden md:block">
          <Button type="submit" variant="ghost" size="icon-sm" title={t.signOut}>
            <LogOut aria-hidden />
            <span className="sr-only">{t.signOut}</span>
          </Button>
        </form>

        <details ref={menuRef} className="group relative md:hidden">
          <summary
            aria-label={ar.nav.menu}
            className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border bg-card text-foreground [&::-webkit-details-marker]:hidden"
          >
            <Menu className="size-4 group-open:hidden" aria-hidden />
            <X className="hidden size-4 group-open:block" aria-hidden />
          </summary>
          <nav
            aria-label={t.label}
            className="absolute end-0 top-full z-40 mt-2 flex w-60 flex-col rounded-lg border bg-popover p-1.5 text-sm shadow-raised"
          >
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href, link.exact);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 transition-colors",
                    active
                      ? "bg-primary-soft font-medium text-primary-soft-foreground"
                      : "text-foreground hover:bg-surface-soft"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {showCompanyLink && (
              <Link
                href="/admin"
                className="mt-1 flex items-center gap-2 rounded-md border-t px-3 py-2 text-foreground transition-colors hover:bg-surface-soft"
              >
                <Building2 className="size-4 text-muted-foreground" aria-hidden />
                {t.companyWorkspace}
              </Link>
            )}
            <form action={signOut} className="mt-1 border-t pt-1">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-muted-foreground transition-colors hover:bg-surface-soft hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden />
                {t.signOut}
              </button>
            </form>
          </nav>
        </details>
      </div>
    </>
  );
}
