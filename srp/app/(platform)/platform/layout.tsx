import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME, ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.platform.title,
  robots: { index: false, follow: false },
};

// D18: the platform console is its own surface with its own gate, not a page
// inside the tenant workspace. Nothing here goes through requireMembership():
// a platform admin needs no membership, and a membership grants nothing here.
export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {PRODUCT_NAME}
            <span className="text-muted-foreground">/</span>
            {ar.platform.title}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />}>
              {ar.platform.backToWorkspace}
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon" title={ar.admin.logout}>
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only">{ar.admin.logout}</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
