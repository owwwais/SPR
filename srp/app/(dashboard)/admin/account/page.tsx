import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireMembership, requireUser } from "@/lib/auth";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.account.title,
};

// Every role reaches this page (settings are owner/admin only): it holds
// nothing but the signed-in person's own identity and password.
export default async function AccountPage() {
  const [session, user] = await Promise.all([requireMembership(), requireUser()]);
  const t = ar.account;
  const hasPassword = (user.identities ?? []).some((identity) => identity.provider === "email");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      <section aria-labelledby="identity-title" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 id="identity-title" className="text-base font-semibold">
          {t.identityTitle}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{t.name}</dt>
          <dd className="font-medium">{session.fullName}</dd>
          <dt className="text-muted-foreground">{t.email}</dt>
          <dd className="font-medium">
            <bdi dir="ltr">{user.email}</bdi>
          </dd>
          <dt className="text-muted-foreground">{t.role}</dt>
          <dd className="font-medium">{ar.admin.roles[session.role]}</dd>
        </dl>
      </section>

      <section aria-labelledby="password-title" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 id="password-title" className="text-base font-semibold">
            {ar.auth.changePassword.title}
          </h2>
          {hasPassword && <p className="text-sm text-muted-foreground">{ar.auth.changePassword.hint}</p>}
        </div>
        <ChangePasswordForm hasPassword={hasPassword} />
      </section>
    </div>
  );
}
