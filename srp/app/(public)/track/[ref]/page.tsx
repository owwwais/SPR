import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";
import { formatDateTime } from "@/lib/format";

// Live status must never be served stale (FR-08 tracking page).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: ar.track.title,
};

// Reads go through the security definer RPC only — anon has no direct
// access to applications/status_history. Statuses + timestamps, no PII.
async function getHistory(refCode: string) {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("track_application", {
      p_ref_code: refCode,
    });
    if (error) {
      console.error("track_application failed:", error.message);
      return [];
    }
    return data;
  } catch (err) {
    console.warn("tracking unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const refCode = decodeURIComponent(ref).trim().toUpperCase();
  const history = await getHistory(refCode);
  const current = history.at(-1);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div>
        <Link
          href="/track"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {ar.track.backToLookup}
        </Link>
        <h1 className="text-3xl font-bold">{ar.track.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar.track.refCode}:{" "}
          <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {refCode}
          </code>
        </p>
      </div>

      {!current ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.track.notFoundTitle}</h2>
          <p className="text-sm text-muted-foreground">{ar.track.notFoundBody}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between rounded-lg border bg-card p-5">
            <span className="text-sm text-muted-foreground">
              {ar.track.currentStatus}
            </span>
            <Badge className="text-sm">{ar.status[current.to_status]}</Badge>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{ar.track.timeline}</h2>
            <ol className="flex flex-col gap-4 border-s-2 ps-5">
              {history.map((entry, i) => (
                <li key={i} className="relative flex flex-col gap-0.5">
                  <CircleCheck
                    className="absolute -start-8 top-0.5 size-4 bg-background text-primary"
                    aria-hidden
                  />
                  <span className="font-medium">
                    {ar.status[entry.to_status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
