import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Briefcase, GraduationCap, Languages, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";

// The public talent page. Everything it may show comes from
// talent.public_profile(), whose column list is the privacy boundary: email,
// phone, the CV path and the raw extraction are absent by construction, not
// by remembering to leave them out here.
//
// Dynamic rather than ISR: hiding or deleting a profile has to take effect
// immediately, and a cached copy of a page someone just withdrew is exactly
// the failure this product cannot afford.
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{32}$/;

type PublicProfile = {
  full_name: string | null;
  headline: string | null;
  city: string | null;
  years_experience: number | null;
  about: string | null;
  strengths: string[];
  focus_areas: string[];
  noindex: boolean;
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

async function getProfile(token: string): Promise<PublicProfile | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const supabase = createPublicClient();
    // public.talent_public_profile is the only API path into the talent
    // schema; the schema itself is not exposed.
    const { data, error } = await supabase.rpc("talent_public_profile", {
      p_token: token,
    });
    if (error) {
      console.error("public_profile failed:", error.message);
      return null;
    }
    return (data as unknown as PublicProfile | null) ?? null;
  } catch (err) {
    console.error(
      "public_profile unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const profile = await getProfile(token);
  if (!profile) return { title: ar.talent.notFound };

  const title = [profile.full_name, profile.headline]
    .filter(Boolean)
    .join(" — ");
  return {
    title: title || ar.talent.name,
    // The person's own choice, honoured in the tag and in robots.ts.
    robots: profile.noindex ? { index: false, follow: false } : undefined,
  };
}

export default async function TalentProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const profile = await getProfile(token);
  if (!profile) notFound();

  const t = ar.talent;
  const visibleSkills = profile.skills ?? [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        {profile.full_name && (
          <h1 className="text-3xl font-bold">{profile.full_name}</h1>
        )}
        {profile.headline && (
          <p className="text-lg text-muted-foreground">{profile.headline}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {profile.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              {profile.city}
            </span>
          )}
          {profile.years_experience !== null && (
            <span className="flex items-center gap-1">
              <Briefcase className="size-4" aria-hidden />
              {profile.years_experience} {t.yearsUnit}
            </span>
          )}
        </div>
        {profile.about && <p className="text-sm leading-7">{profile.about}</p>}
      </header>

      {/* Strengths in words, never a number. A standing score beside a real
          person's name would harm them, and would be wrong besides: the
          rubric is relative to a specific job. */}
      {profile.strengths?.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t.strengths}</h2>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
              {profile.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {profile.focus_areas?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t.focusAreas}</h2>
          <div className="flex flex-wrap gap-2">
            {profile.focus_areas.map((f, i) => (
              <Badge key={i} variant="secondary">
                {f}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {visibleSkills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t.skills}</h2>
          <div className="flex flex-wrap gap-2">
            {visibleSkills.map((s) => (
              <Badge key={s.id} variant="outline">
                {s.label}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {profile.experiences?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t.experience}</h2>
          {profile.experiences.map((e, i) => (
            <div key={i} className="border-s-2 ps-4">
              <p className="font-medium">{e.title}</p>
              <p className="text-sm text-muted-foreground">
                {[e.company, [e.start, e.end].filter(Boolean).join(" — ")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {e.summary && <p className="mt-1 text-sm">{e.summary}</p>}
            </div>
          ))}
        </section>
      )}

      {profile.education?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="size-4" aria-hidden />
            {t.education}
          </h2>
          {profile.education.map((e, i) => (
            <p key={i} className="text-sm">
              {[e.degree, e.field, e.institution, e.year]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ))}
        </section>
      )}

      {profile.languages?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Languages className="size-4" aria-hidden />
            {t.languages}
          </h2>
          <p className="text-sm">{profile.languages.join(" · ")}</p>
        </section>
      )}

      {/* No email, no phone, no address — anywhere on this page. */}
      <footer className="border-t pt-4 text-xs text-muted-foreground">
        {t.contactViaPlatform}
      </footer>
    </main>
  );
}
