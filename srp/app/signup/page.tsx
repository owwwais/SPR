import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import { SignupForm } from "./signup-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { AudienceTabs } from "@/components/seeker/onboarding/audience-tabs";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.signupTitle,
};

// One account, two doors (D26): "I'm looking for work" and "I represent a
// company". The tab only chooses where the confirmed account is sent — the
// CV-first onboarding or the organization form — and is never stored. What
// a user may do comes from rows (a membership, a talent profile), which the
// onboarding creates.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; next?: string }>;
}) {
  const params = await searchParams;
  const as = params.as === "seeker" ? "seeker" : "company";
  // Same-site paths only (lib/redirects.ts). An invitation link passes its
  // own page here so the new account lands back on it.
  const next = safeNext(params.next, "") || undefined;
  const target = next ?? (as === "seeker" ? "/onboarding/seeker" : "/onboarding");

  // Already signed in: the next unfinished step, which forwards on by
  // itself when there is nothing left to do there.
  if (await getUser()) redirect(target);

  const withNext = (path: string) =>
    next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;
  const loginHref =
    target === "/onboarding" ? "/login" : `/login?next=${encodeURIComponent(target)}`;

  return (
    <AuthShell audience={as}>
      <div className="flex flex-col gap-6">
        <AudienceTabs
          label={ar.auth.tabs.label}
          tabs={[
            {
              href: withNext("/signup?as=seeker"),
              label: ar.auth.tabs.seeker,
              active: as === "seeker",
            },
            {
              href: withNext("/signup?as=company"),
              label: ar.auth.tabs.company,
              active: as === "company",
            },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">{ar.auth.signupTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {as === "seeker" ? ar.auth.signupSubtitleSeeker : ar.auth.signupSubtitleCompany}
          </p>
        </div>
        <div className="flex flex-col gap-5">
          {/* A Google account arrives with a verified email, so nothing paid
              ever runs for an unproven address (D26). */}
          <GoogleButton next={target} />
          <AuthDivider />
          <SignupForm as={as} next={next} loginHref={loginHref} />
        </div>
      </div>
    </AuthShell>
  );
}
