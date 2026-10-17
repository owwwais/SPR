import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, MailCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import { homePath } from "@/lib/seeker";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeNext } from "@/lib/redirects";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.loginTitle,
};

// "No account?" keeps the destination: a visitor sent here from a seeker
// page opens signup on the seeker tab, and any other same-site destination
// (an invitation link) travels on as `next`.
function signupHrefFor(target: string | null): string {
  if (!target) return "/signup";
  const params = new URLSearchParams();
  if (target === "/onboarding/seeker" || target === "/me" || target.startsWith("/me/")) {
    params.set("as", "seeker");
  }
  if (target !== "/onboarding/seeker" && target !== "/onboarding") {
    params.set("next", target);
  }
  const query = params.toString();
  return query ? `/signup?${query}` : "/signup";
}

// One sign-in for both hats (D26). Where it leads is decided afterwards by
// the rows the account has — /onboarding routes a workspace member to
// /admin and a seeker to /me — so the form itself asks nothing about who is
// signing in.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Same-site paths only (lib/redirects.ts).
  const target = next ? safeNext(next, "") || null : null;

  // Signed in already: no form to show, just the right page.
  if (await getUser()) redirect(target ?? (await homePath()));

  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16"
    >
      <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/35">
        <BrandMark />
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-xl leading-snug font-semibold">{ar.auth.loginTitle}</h1>
          <CardDescription>{ar.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {error === "oauth" && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{ar.auth.errors.oauth}</AlertDescription>
            </Alert>
          )}
          {/* The confirmation link already confirmed the address; only the
              automatic sign-in failed (typically another browser). Not an
              error, so not shown as one. */}
          {error === "confirm" && (
            <Alert variant="info">
              <MailCheck className="size-4" aria-hidden />
              <AlertDescription>{ar.auth.confirmNotice}</AlertDescription>
            </Alert>
          )}
          <GoogleButton next={target ?? undefined} />
          <AuthDivider />
          <LoginForm next={target ?? undefined} signupHref={signupHrefFor(target)} />
        </CardContent>
      </Card>
    </main>
  );
}
