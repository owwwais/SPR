import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, CircleCheck, MailCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import { homePath } from "@/lib/seeker";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth/auth-shell";
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
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
}) {
  const { next, error, notice } = await searchParams;
  // Same-site paths only (lib/redirects.ts).
  const target = next ? safeNext(next, "") || null : null;

  // Signed in already: no form to show, just the right page.
  if (await getUser()) redirect(target ?? (await homePath()));

  return (
    <AuthShell audience="both">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">{ar.auth.loginTitle}</h1>
          <p className="text-sm text-muted-foreground">{ar.auth.loginSubtitle}</p>
        </div>
        <div className="flex flex-col gap-5">
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
          {/* The confirmation link had expired or was already used, so the
              address is NOT confirmed yet — signing up again sends a new one. */}
          {error === "link_expired" && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{ar.auth.errors.linkExpired}</AlertDescription>
            </Alert>
          )}
          {/* A seeker who deleted their account lands here signed out
              (deleteSeekerAccount): the deletion is confirmed, not implied. */}
          {notice === "account_deleted" && (
            <Alert variant="success" role="status">
              <CircleCheck className="size-4" aria-hidden />
              <AlertDescription>{ar.auth.accountDeletedNotice}</AlertDescription>
            </Alert>
          )}
          <GoogleButton next={target ?? undefined} />
          <AuthDivider />
          <LoginForm next={target ?? undefined} signupHref={signupHrefFor(target)} />
        </div>
      </div>
    </AuthShell>
  );
}
