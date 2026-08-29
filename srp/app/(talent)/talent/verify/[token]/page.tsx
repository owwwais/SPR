import { redirect } from "next/navigation";
import { ar } from "@/lib/i18n/ar";

// Step two: the link from the email lands here, and this is where the paid
// model call finally happens. Everything before this point cost storage and
// nothing else, which is the entire cost control for an anonymous upload.
export const dynamic = "force-dynamic";

export default async function TalentVerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = ar.talent;

  if (!/^[0-9a-f]{32}$/.test(token)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">{t.errors.expired}</h1>
      </main>
    );
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let publicToken: string | null = null;

  try {
    const res = await fetch(`${base}/functions/v1/talent-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ verify_token: token }),
      cache: "no-store",
    });
    const body = (await res.json()) as { ok?: boolean; public_token?: string };
    if (res.ok && body.ok && body.public_token) {
      publicToken = body.public_token;
    }
  } catch (err) {
    console.error(
      "talent verify failed:",
      err instanceof Error ? err.message : err
    );
  }

  if (!publicToken) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">{t.errors.expired}</h1>
      </main>
    );
  }

  // Straight to review: the person clicked a link expecting to continue, not
  // to read a confirmation about having clicked it.
  redirect(`/talent/review/${publicToken}`);
}
