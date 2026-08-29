import { ar } from "@/lib/i18n/ar";
import Link from "next/link";

// The companion product's own shell. Deliberately plainer than the
// recruitment site: the value proposition is a clean page with one link, and
// chrome would work against that.
export default function TalentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/talent" className="font-bold">
            {ar.talent.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {ar.talent.tagline}
          </span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {ar.footer.rights} — {ar.common.appName}
      </footer>
    </div>
  );
}
