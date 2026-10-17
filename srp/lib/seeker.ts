import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { AnalysisStatus, JobType } from "@/types/database";

// The seeker gate (D26). The "hat" comes from rows, never from user_metadata:
// a talent.profiles row carrying this user's id is what makes someone a
// seeker, exactly as a memberships row is what makes them company staff. The
// profile is read through public.talent_my_profile() — a security definer
// function that resolves the caller from auth.uid() and returns a fixed
// column list — because the talent schema grants no table access to
// authenticated at all.

export type OnboardingStep = "cv" | "contact" | "review" | "consents" | "done";

export type SeekerExperience = {
  title: string;
  company: string | null;
  start: string | null;
  end: string | null;
  summary: string;
};

export type SeekerEducation = {
  degree: string;
  field: string | null;
  institution: string | null;
  year: string | null;
};

export type SeekerCvVersion = {
  id: string;
  mime: string;
  created_at: string;
  analysis_status: AnalysisStatus;
  is_current: boolean;
};

export type SeekerPreferences = {
  work_types: JobType[];
  relocate: boolean | null;
};

export type SeekerProfile = {
  id: string;
  email: string;
  status: "draft" | "published" | "hidden";
  onboarding_step: OnboardingStep;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  full_name: string | null;
  headline: string | null;
  city: string | null;
  years_experience: number | null;
  about: string | null;
  phone: string | null;
  preferences: SeekerPreferences;
  strengths: string[];
  focus_areas: string[];
  hidden_skills: string[];
  skills: { id: string; label: string }[];
  experiences: SeekerExperience[];
  education: SeekerEducation[];
  languages: string[];
  consent_public: boolean;
  consent_offers: boolean;
  noindex: boolean;
  public_token: string;
  cv_versions: SeekerCvVersion[];
};

export type Hats = {
  company: boolean;
  seeker: boolean;
  seekerStep: OnboardingStep | null;
};

const NO_HATS: Hats = { company: false, seeker: false, seekerStep: null };

// Which hats the signed-in user wears, for routing and the switcher only.
// Memoized per request.
export const getHats = cache(async (): Promise<Hats> => {
  const user = await getUser();
  if (!user) return NO_HATS;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_hats");
  if (error || !data) {
    if (error) console.error("my_hats failed:", error.message);
    return NO_HATS;
  }
  const hats = data as { company?: boolean; seeker?: boolean; seeker_step?: OnboardingStep | null };
  return {
    company: hats.company === true,
    seeker: hats.seeker === true,
    seekerStep: hats.seeker_step ?? null,
  };
});

// The caller's own profile, or null when they have none. Memoized per request.
export const getSeekerProfile = cache(async (): Promise<SeekerProfile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_my_profile");
  if (error) {
    console.error("talent_my_profile failed:", error.message);
    return null;
  }
  return (data as SeekerProfile | null) ?? null;
});

export type SeekerSession = {
  userId: string;
  email: string;
  profile: SeekerProfile;
};

// Every /me page goes through this gate. Signed out → login (and back here
// afterwards); signed in without a profile → the CV-first onboarding; an
// unfinished onboarding → its next step. `allowIncomplete` is for the
// onboarding pages themselves.
export async function requireSeeker(
  options: { next?: string; allowIncomplete?: boolean } = {}
): Promise<SeekerSession> {
  const user = await getUser();
  if (!user) {
    const next = options.next ?? "/me";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const profile = await getSeekerProfile();
  if (!profile) redirect("/onboarding/seeker");
  if (!options.allowIncomplete && profile.onboarding_step !== "done") {
    redirect("/onboarding/seeker");
  }
  return { userId: user.id, email: user.email ?? profile.email, profile };
}

// Where a signed-in user belongs when nothing more specific was asked for.
export async function homePath(): Promise<string> {
  const hats = await getHats();
  if (hats.company) return "/admin";
  if (hats.seeker) return hats.seekerStep === "done" ? "/me" : "/onboarding/seeker";
  return "/onboarding";
}
