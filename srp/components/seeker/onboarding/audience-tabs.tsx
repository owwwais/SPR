import Link from "next/link";
import { cn } from "@/lib/utils";

export type AudienceTab = {
  href: string;
  label: string;
  active: boolean;
};

// "I'm looking for work" / "I represent a company". Links rather than a
// client-side tab widget, so the page that hosts them stays server-rendered
// and each tab has its own URL (?as=seeker|company). The choice is a routing
// hint only: it decides which onboarding a new account is sent to, and is
// never stored or read as an authorization fact (D26).
//
// Underline tabs per DESIGN.md §9: the active one in ink with a 2px primary
// bar, the others muted.
export function AudienceTabs({
  label,
  tabs,
  className,
}: {
  label: string;
  tabs: AudienceTab[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("grid grid-cols-2 border-b", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          replace
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "-mb-px rounded-t-md border-b-2 px-3 py-3 text-center text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/35",
            tab.active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
