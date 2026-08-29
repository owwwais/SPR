import Link from "next/link";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const f = ar.footer;

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Scale className="size-5 text-primary" aria-hidden />
            <span>{ar.common.appName}</span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm sm:flex">
            <Link
              href="/jobs"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar.nav.jobs}
            </Link>
            <Link
              href="/companies"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {f.companies}
            </Link>
            <Link
              href="/pricing"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {f.pricing}
            </Link>
            <Link
              href="/fairness"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {f.fairness}
            </Link>
            {/* The companion product had no link from anywhere, so it was
                reachable only by typing the URL. It sits with the other
                public destinations, not hidden in the footer. */}
            <Link
              href="/talent"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar.talent.navLabel}
            </Link>
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {f.login}
            </Link>
            <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
              {f.signup}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/20">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <Scale className="size-4 text-primary" aria-hidden />
              {ar.common.appName}
            </span>
            <p className="text-sm text-muted-foreground">
              {ar.landing.fairnessTitle}
            </p>
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            <span className="font-medium">{f.product}</span>
            <Link
              href="/jobs"
              className="text-muted-foreground hover:text-foreground"
            >
              {ar.nav.jobs}
            </Link>
            <Link
              href="/companies"
              className="text-muted-foreground hover:text-foreground"
            >
              {f.companies}
            </Link>
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground"
            >
              {f.pricing}
            </Link>
            <Link
              href="/talent"
              className="text-muted-foreground hover:text-foreground"
            >
              {ar.talent.navLabel}
            </Link>
          </nav>

          <nav className="flex flex-col gap-2 text-sm">
            <span className="font-medium">{f.company}</span>
            <Link
              href="/fairness"
              className="text-muted-foreground hover:text-foreground"
            >
              {f.fairness}
            </Link>
            <Link
              href="/track"
              className="text-muted-foreground hover:text-foreground"
            >
              {ar.nav.track}
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground"
            >
              {ar.nav.hrLogin}
            </Link>
          </nav>

          <nav className="flex flex-col gap-2 text-sm">
            <span className="font-medium">{f.legal}</span>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground"
            >
              {f.privacy}
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground"
            >
              {f.terms}
            </Link>
          </nav>
        </div>

        <div className="border-t">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-center px-4 text-sm text-muted-foreground">
            <span>
              {ar.common.appName} — {f.rights}
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
