"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/lib/i18n/ar";

// Re-renders the server page every few seconds while the CV analysis runs,
// so its result appears without the person reloading (plan §2.3: the wait is
// hidden behind the contact step). It stops by itself: the moment the server
// renders a finished status, `active` turns false and the timer is cleared.
//
// Bounded twice over, so a tab left open never polls forever: it skips while
// the tab is hidden, and gives up after `maxPolls` with a note to refresh
// later — an analysis that has not finished in a few minutes is not going to
// finish in the next three seconds.
export function AnalysisWatcher({
  active,
  intervalMs = 3000,
  maxPolls = 60,
}: {
  active: boolean;
  intervalMs?: number;
  maxPolls?: number;
}) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!active) return;
    let polls = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      polls += 1;
      if (polls > maxPolls) {
        window.clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, maxPolls, router]);

  if (!active || !gaveUp) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {ar.seekerOnboarding.analysis.slow}
    </p>
  );
}
