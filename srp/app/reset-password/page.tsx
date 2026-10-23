import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser } from "@/lib/auth";
import { RECOVERY_COOKIE } from "@/lib/auth-cookies";
import { ResetPasswordForm } from "./reset-password-form";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.reset.title,
};

// Reached only from a recovery link: /auth/callback signs the user in and
// marks the session with RECOVERY_COOKIE. Anyone else is sent to ask for a
// link (a signed-in user changes their password from their account page,
// with the current one).
export default async function ResetPasswordPage() {
  const recovering = (await cookies()).get(RECOVERY_COOKIE);
  if (!recovering || !(await getUser())) redirect("/forgot-password?error=link_expired");

  const t = ar.auth.reset;
  return (
    <AuthShell audience="both">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <ResetPasswordForm />
      </div>
    </AuthShell>
  );
}
