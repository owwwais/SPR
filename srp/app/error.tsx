"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

// Same reason as not-found: the default is English. The digest is the only
// thing shown — never the message, which can carry query fragments or
// applicant data.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("unhandled error:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlert className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">{ar.errors.serverTitle}</h1>
      <p className="text-sm text-muted-foreground">{ar.errors.serverBody}</p>
      {error.digest && (
        <code className="text-xs text-muted-foreground" dir="ltr">
          {error.digest}
        </code>
      )}
      <Button onClick={reset}>{ar.errors.retry}</Button>
    </main>
  );
}
