import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { ReviewForm } from "@/components/talent/review-form";
import { ar } from "@/lib/i18n/ar";

// Step three. The page that decides whether this product is trustworthy: the
// person corrects what we got wrong before their name goes on it.
export const dynamic = "force-dynamic";

export type ReviewProfile = {
  status: string;
  analysis_status: string;
  analysis_error: string | null;
  full_name: string | null;
  headline: string | null;
  city: string | null;
  years_experience: number | null;
  about: string | null;
  strengths: string[];
  focus_areas: string[];
  hidden_skills: string[];
  noindex: boolean;
  consent_public: boolean;
  consent_offers: boolean;
  skills: { id: string; label: string }[];
  experiences: {
    title: string;
    company: string | null;
    start: string | null;
    end: string | null;
    summary: string;
  }[];
  education: {
    degree: string;
    field: string | null;
    institution: string | null;
    year: string | null;
  }[];
  languages: string[];
};

export default async function TalentReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("talent_review_profile", {
    p_token: token,
  });
  if (error) console.error("talent_review_profile failed:", error.message);

  const profile = data as unknown as ReviewProfile | null;
  if (!profile) notFound();

  const t = ar.talent;

  // Extraction can fail on a scanned or unreadable file. Publishing a bad
  // page under someone's name is worse than not publishing one, so there is
  // no publish button in that state.
  if (profile.analysis_status !== "done") {
    const failed = profile.analysis_status === "failed";
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">
          {failed ? t.errors.server : t.analyzing}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed ? "" : t.analyzingBody}
        </p>
        {/* analysis_error already carries a [trace-id] prefix written by
            talent-analyze — the same id its own logs are searchable by, so
            this is reportable rather than a dead end. */}
        {failed && profile.analysis_error && (
          <p
            className="mx-auto mt-4 max-w-md rounded-lg border bg-muted/30 p-3 text-start text-xs text-muted-foreground"
            dir="ltr"
          >
            {profile.analysis_error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t.reviewTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.reviewBody}</p>
      </header>
      <ReviewForm token={token} profile={profile} />
    </main>
  );
}
