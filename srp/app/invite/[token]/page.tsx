import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MailX } from "lucide-react";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { AcceptForm } from "./accept-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ar } from "@/lib/i18n/ar";
import type { MemberRole } from "@/types/database";

export const metadata: Metadata = {
  title: ar.invite.title,
};

type Preview = {
  org_name: string;
  role: MemberRole;
  expires_at: string;
};

// invitation_preview (0010) is security definer and returns only the company
// name and the offered role — never the invited email or the org id. An
// invitee cannot read the invitations table itself; they are not a member.
async function getPreview(token: string): Promise<Preview | null> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("invitation_preview", {
      p_token: token,
    });
    if (error) {
      console.error("invitation preview failed:", error.message);
      return null;
    }
    const rows = data as unknown as Preview[] | null;
    return rows && rows.length > 0 ? rows[0]! : null;
  } catch (err) {
    console.warn(
      "invitation preview unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Briefcase className="size-5 text-primary" aria-hidden />
        <span>{ar.common.appName}</span>
      </Link>
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getPreview(token);
  const t = ar.invite;

  if (!preview) {
    return (
      <Shell>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MailX className="size-10 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-semibold">{t.invalidTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.invalidBody}</p>
        </CardContent>
      </Shell>
    );
  }

  const user = await getUser();

  // Not signed in: the invitation is tied to an email address, so the only
  // useful next step is to sign in (or register) with that address. The link
  // is preserved so they land back here afterwards.
  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <Shell>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>
            {t.invitedTo} <strong>{preview.org_name}</strong> —{" "}
            {ar.admin.roles[preview.role]}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.signInFirst}</p>
          <Button nativeButton={false} render={<Link href={`/login?next=${next}`} />}>
            {ar.auth.submit}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/signup?next=${next}`} />}
          >
            {ar.auth.signupSubmit}
          </Button>
        </CardContent>
      </Shell>
    );
  }

  // Signed in: does this account already carry a display name?
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Shell>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {t.invitedTo} <strong>{preview.org_name}</strong> —{" "}
          {ar.admin.roles[preview.role]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptForm token={token} needsName={!profile?.full_name} />
      </CardContent>
    </Shell>
  );
}
