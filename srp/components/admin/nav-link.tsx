"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Inline pending feedback while a (dynamic, uncached) navigation is in
// flight. Always rendered at fixed size — only opacity toggles — so there
// is no layout shift (per the useLinkStatus guidance).
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 animate-spin transition-opacity duration-150",
        pending ? "opacity-100" : "opacity-0"
      )}
    />
  );
}

export function NavLink({
  href,
  exact = false,
  badge,
  badgeLabel,
  nested = false,
  children,
}: {
  href: string;
  exact?: boolean;
  /** A count shown at the end edge (new applicants, say); 0 shows nothing. */
  badge?: number;
  /** What the count means, for screen readers. */
  badgeLabel?: string;
  /** A second-level item (an active job under "الوظائف"). */
  nested?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md text-sm whitespace-nowrap transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none",
        nested ? "min-h-8 py-1.5 ps-10 pe-3" : "min-h-9 px-3 py-2",
        active
          ? "bg-primary-soft font-medium text-primary-soft-foreground"
          : nested
            ? "text-muted-foreground hover:bg-surface-sunken/70 hover:text-foreground"
            : "text-body hover:bg-surface-sunken/70 hover:text-foreground"
      )}
    >
      {children}
      <span className="ms-auto flex items-center gap-1.5">
        <PendingHint />
        {badge ? (
          <span className="rounded-sm bg-primary-soft px-1.5 text-xs font-semibold text-primary-soft-foreground tabular-nums">
            <bdi>{badge}</bdi>
            {badgeLabel && <span className="sr-only"> {badgeLabel}</span>}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
