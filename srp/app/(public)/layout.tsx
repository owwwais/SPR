import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const f = ar.footer;

  const links = [
    { href: "/jobs", label: ar.nav.jobs },
    { href: "/companies", label: f.companies },
    { href: "/pricing", label: f.pricing },
    { href: "/fairness", label: f.fairness },
    // The companion product had no link from anywhere, so it was reachable
    // only by typing the URL. It sits with the other public destinations.
    { href: "/talent", label: ar.talent.navLabel },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 xl:px-10">
          <Link href="/">
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-6 text-sm md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground sm:inline"
            >
              {f.login}
            </Link>
            <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
              {f.signup}
            </Button>

            {/* Below md the nav was simply hidden, leaving phone visitors
                with no way to the marketplace except the footer. A native
                disclosure needs no client JavaScript and is keyboard- and
                screen-reader-operable as is. */}
            <details className="group relative md:hidden">
              <summary
                aria-label={ar.nav.menu}
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border bg-card text-foreground [&::-webkit-details-marker]:hidden"
              >
                <Menu className="size-4 group-open:hidden" aria-hidden />
                <X className="hidden size-4 group-open:block" aria-hidden />
              </summary>
              <nav className="absolute end-0 top-full mt-2 flex w-56 flex-col rounded-lg border bg-popover p-1.5 text-sm shadow-raised">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-foreground transition-colors hover:bg-surface-soft"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/login"
                  className="mt-1 rounded-md border-t px-3 py-2 text-muted-foreground transition-colors hover:bg-surface-soft"
                >
                  {f.login}
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t bg-surface-soft/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 xl:px-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <BrandMark size="sm" />
            <p className="max-w-xs text-sm text-muted-foreground">
              {ar.landing.fairnessTitle}
            </p>
          </div>

          <nav className="flex flex-col gap-2.5 text-sm">
            <span className="font-medium">{f.product}</span>
            <Link href="/jobs" className="text-muted-foreground hover:text-foreground">
              {ar.nav.jobs}
            </Link>
            <Link href="/companies" className="text-muted-foreground hover:text-foreground">
              {f.companies}
            </Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
              {f.pricing}
            </Link>
            <Link href="/talent" className="text-muted-foreground hover:text-foreground">
              {ar.talent.navLabel}
            </Link>
          </nav>

          <nav className="flex flex-col gap-2.5 text-sm">
            <span className="font-medium">{f.company}</span>
            <Link href="/fairness" className="text-muted-foreground hover:text-foreground">
              {f.fairness}
            </Link>
            <Link href="/track" className="text-muted-foreground hover:text-foreground">
              {ar.nav.track}
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              {ar.nav.hrLogin}
            </Link>
          </nav>

          <nav className="flex flex-col gap-2.5 text-sm">
            <span className="font-medium">{f.legal}</span>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              {f.privacy}
            </Link>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground">
              {f.terms}
            </Link>
          </nav>
        </div>

        <div className="border-t">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-4 text-xs text-muted-foreground sm:px-6 xl:px-10">
            <span>
              {ar.common.appName} — {f.rights}
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
