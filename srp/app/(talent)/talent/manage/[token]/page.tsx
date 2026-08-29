import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { ManagePanel } from "@/components/talent/manage-panel";
import { ar } from "@/lib/i18n/ar";

// Where the person keeps control after publishing: hide, republish, or
// delete outright. Reached by the same token, which is the capability — the
// journey has no password by design.
export const dynamic = "force-dynamic";

export default async function TalentManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { token } = await params;
  const { published } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();

  const supabase = createPublicClient();
  const { data } = await supabase.rpc("talent_review_profile", {
    p_token: token,
  });
  const profile = data as unknown as { status: string } | null;
  if (!profile) notFound();

  const t = ar.talent;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/t/${token}`;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      {published === "1" && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <h1 className="font-semibold">{t.publishedTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.publishedBody}</p>
        </div>
      )}
      <ManagePanel token={token} url={url} status={profile.status} />
    </main>
  );
}
