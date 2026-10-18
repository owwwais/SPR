"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the current page's server components on an interval while
// something is being generated elsewhere (a bank, an interview's gap
// probes). The server re-reads the state each time, so nothing is kept or
// guessed here; a hidden tab skips its turn instead of polling unseen.
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
