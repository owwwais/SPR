"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

// The seeker's public page link, shown in full so it can be checked before
// it is shared. The absolute address comes from NEXT_PUBLIC_SITE_URL when it
// is configured, and from the page's own origin otherwise — the same page
// is served under both.
export function PublicLink({
  path,
  siteUrl,
}: {
  path: string;
  siteUrl: string | null;
}) {
  const t = ar.seekerPortal.settings;
  const [copied, setCopied] = useState(false);
  const display = siteUrl ? `${siteUrl}${path}` : path;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t.publicLink}</span>
      <div className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center">
        <code dir="ltr" className="min-w-0 flex-1 truncate text-start font-mono text-xs">
          {display}
        </code>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const url = siteUrl
                ? `${siteUrl}${path}`
                : new URL(path, window.location.origin).toString();
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                // Clipboard access can be refused (permissions, insecure
                // context); the address stays visible and selectable.
              }
            }}
          >
            <Copy aria-hidden />
            <span role="status">{copied ? t.copied : t.copyLink}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href={path} target="_blank" rel="noopener noreferrer" />}
          >
            {t.openPublicPage}
            <ExternalLink aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
