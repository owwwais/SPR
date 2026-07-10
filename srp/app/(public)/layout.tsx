import Link from "next/link";
import { Briefcase } from "lucide-react";
import { ar } from "@/lib/i18n/ar";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Briefcase className="size-5 text-primary" aria-hidden />
            <span>{ar.common.appName}</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar.nav.home}
            </Link>
            <Link
              href="/jobs"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar.nav.jobs}
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar.nav.hrLogin}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-center px-4 text-sm text-muted-foreground">
          <span>
            {ar.common.appName} — {ar.footer.rights}
          </span>
        </div>
      </footer>
    </>
  );
}
