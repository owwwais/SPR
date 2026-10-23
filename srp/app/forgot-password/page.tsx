import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.forgot.title,
};

// Open to everyone, signed in or not: a Google-only account uses it to add a
// password, and it reveals nothing about which addresses are registered.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = ar.auth.forgot;

  return (
    <AuthShell audience="both">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        {error === "link_expired" && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{t.linkExpired}</AlertDescription>
          </Alert>
        )}
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
