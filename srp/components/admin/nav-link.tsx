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
  children,
}: {
  href: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
      <span className="ms-auto flex items-center">
        <PendingHint />
      </span>
    </Link>
  );
}
