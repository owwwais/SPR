"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While a CV is being analysed the page asks the server again every few
// seconds, and stops by itself once the server renders it as settled
// (`active` turns false and the effect is cleaned up). A plain refresh, not
// a socket: the analysis takes tens of seconds and happens rarely.
export function AnalysisRefresher({
  active,
  intervalMs = 4000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, router]);

  return null;
}
