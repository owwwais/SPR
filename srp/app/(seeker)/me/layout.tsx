import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PortalNav } from "@/components/seeker/portal/portal-nav";
import { getUser } from "@/lib/auth";
import { getHats, requireSeeker } from "@/lib/seeker";

// The seeker portal shell (D26). The gate is the seeker's own profile row,
// read through talent_my_profile() — never the signup tab, never
// user_metadata. Every page calls requireSeeker() itself (memoised per
// request), so no page depends on this layout having run first.
//
// A signed-out visitor is left to the page: only the page knows its own
// path, and the login redirect has to carry it back (/me/apply/<id> after
// signing in, not /me). The shell itself holds nothing but links.
//
// Calm and guided (DESIGN.md §1): a header with the five destinations and
// nothing else, native scrolling (A11), content on the canvas.
export default async function SeekerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (await getUser()) await requireSeeker();
  const hats = await getHats();

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/me" className="shrink-0">
            <BrandMark />
          </Link>
          <PortalNav showCompanyLink={hats.company} />
        </div>
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </div>
      </main>
    </>
  );
}
