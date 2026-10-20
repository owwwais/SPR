"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import {
  CV_FORM_MAX_BYTES,
  CV_MIME_TYPES,
  type CvMime,
} from "@/lib/validations/application";
import { ar } from "@/lib/i18n/ar";

// The seeker's writes (D26). Shared by the CV-first onboarding and the /me
// portal, so both speak to the database the same way.
//
// None of these trusts anything about WHO is calling beyond the session: the
// talent_* functions resolve the caller from auth.uid() inside the database,
// and talent-upload resolves it from the forwarded access token. There is no
// user id, profile id or org id in any request built here.

export type UploadCvState = {
  ok: boolean;
  error: string | null;
  unchanged?: boolean;
};

export type SeekerFormState = {
  ok: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
};

type RpcResult = { ok?: boolean; error?: string; field?: string } | null;

const e = ar.seekerOnboarding.errors;

function formFail(
  error: string,
  fieldErrors: Record<string, string> = {}
): SeekerFormState {
  return { ok: false, error, fieldErrors };
}

function withReference(message: string, reference: string | undefined): string {
  return reference
    ? e.withReference.replace("{message}", message).replace("{reference}", reference)
    : message;
}

// Every page that renders the seeker's profile. Dynamic pages are not held
// in a server cache, but the client router keeps a copy of each visited one.
function revalidateSeekerPaths() {
  revalidatePath("/onboarding/seeker");
  revalidatePath("/me");
  revalidatePath("/me/profile");
}

// Field names the database reports, translated to the form fields the user
// can see. The database speaks of "preferences" (one jsonb column); the form
// has a group of work-type checkboxes.
const FIELD_KEYS: Record<string, string> = {
  full_name: "full_name",
  phone: "phone",
  city: "city",
  preferences: "work_types",
  headline: "headline",
  years_experience: "years_experience",
  about: "about",
};

const FIELD_MESSAGES: Record<string, string> = {
  full_name: e.fullName,
  phone: e.phone,
  city: e.city,
  work_types: e.workTypes,
  headline: e.headline,
  years_experience: e.years,
  about: e.about,
};

// Turns a talent_* function's { ok, error, field } into form state. The
// codes are the database's; the wording is ours.
function settle(
  data: unknown,
  error: { message: string } | null,
  label: string
): SeekerFormState {
  if (error) {
    console.error(`${label} failed:`, error.message);
    return formFail(e.generic);
  }
  const result = data as RpcResult;
  if (result?.ok) {
    revalidateSeekerPaths();
    return { ok: true, error: null, fieldErrors: {} };
  }
  switch (result?.error) {
    case "not_found":
      return formFail(e.notFound);
    case "analysis_not_ready":
      return formFail(e.analysisNotReady);
    case "not_available":
      return formFail(e.notAvailable);
    case "invalid": {
      const key = FIELD_KEYS[result.field ?? ""];
      return formFail(e.invalid, key ? { [key]: FIELD_MESSAGES[key] ?? e.invalid } : {});
    }
    default:
      console.error(`${label} refused:`, result?.error ?? "no result");
      return formFail(e.generic);
  }
}

// Empty means "not given": the database stores null, not "".
function text(value: FormDataEntryValue | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function distinct(values: FormDataEntryValue[], limit: number): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => typeof v === "string" && v !== ""))
  ).slice(0, limit);
}

// The browser's claim about a file, corrected by its extension when the
// browser made none: some send a DOCX as application/octet-stream or with no
// type at all. talent-upload compares the declared type with the file's
// leading bytes, so a wrong label is still refused there — this only stops
// a genuine file being turned away for its browser's silence.
function declaredMime(file: File): CvMime | null {
  if (file.type in CV_MIME_TYPES) return file.type as CvMime;
  if (file.type !== "" && file.type !== "application/octet-stream") return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

// Mirrors the apply flow: the browser never calls the Edge Function itself.
// What travels is the user's own access token — never the anon key — because
// talent-upload is account-only (D26): it resolves the user from that token,
// refuses an unverified address before any paid analysis, and creates or
// finds the profile by the user's id.
export async function uploadSeekerCv(
  _prev: UploadCvState,
  formData: FormData
): Promise<UploadCvState> {
  const fail = (error: string): UploadCvState => ({ ok: false, error });

  const user = await getUser();
  if (!user) return fail(e.authRequired);

  // Cheap checks first, so a file that will be refused is not sent across
  // the network to be refused there.
  const raw = formData.get("cv");
  if (!(raw instanceof File) || raw.size === 0) return fail(e.cvRequired);
  if (raw.size > CV_FORM_MAX_BYTES) return fail(e.cvSize);
  const mime = declaredMime(raw);
  if (!mime) return fail(e.cvType);
  const cv = raw.type === mime ? raw : new File([raw], raw.name, { type: mime });

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return fail(e.authRequired);

  const body = new FormData();
  body.set("cv", cv);

  let response: Response;
  try {
    const { url } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/talent-upload`, {
      method: "POST",
      // Content-Type deliberately unset: fetch derives the multipart
      // boundary from the FormData body.
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
      cache: "no-store",
    });
  } catch (err) {
    console.error("talent-upload unreachable:", err instanceof Error ? err.message : err);
    return fail(e.uploadFailed);
  }

  let payload: {
    ok?: boolean;
    unchanged?: boolean;
    error?: string;
    field?: string;
    request_id?: string;
  };
  try {
    payload = await response.json();
  } catch (err) {
    console.error(
      "talent-upload returned a non-JSON body:",
      err instanceof Error ? err.message : err
    );
    return fail(e.uploadFailed);
  }

  if (response.ok && payload.ok) {
    revalidateSeekerPaths();
    return { ok: true, error: null, unchanged: payload.unchanged === true };
  }

  switch (payload.error) {
    case "auth_required":
      return fail(e.authRequired);
    case "email_unverified":
      return fail(e.emailUnverified);
    case "rate_limited":
      return fail(e.rateLimited);
    case "invalid_input":
      if (payload.field === "cv_type") return fail(e.cvType);
      if (payload.field === "cv_size") return fail(e.cvSize);
      return fail(e.cvRequired);
    default:
      // The reference is the function's request id: a search in its logs
      // for this exact string lands on the failing request. It carries no
      // personal data.
      return fail(withReference(e.uploadFailed, payload.request_id));
  }
}

export async function saveSeekerContact(
  _prev: SeekerFormState,
  formData: FormData
): Promise<SeekerFormState> {
  if (!(await getUser())) return formFail(e.authRequired);

  const relocate = formData.get("relocate");
  const supabase = await createClient();
  // The database validates every value (and drops unknown preference keys);
  // nothing here decides what is acceptable, so the two cannot disagree.
  const { data, error } = await supabase.rpc("talent_save_my_contact", {
    p_full_name: text(formData.get("full_name")),
    p_phone: text(formData.get("phone")),
    p_city: text(formData.get("city")),
    p_preferences: {
      work_types: distinct(formData.getAll("work_types"), 10),
      relocate: relocate === "yes" ? true : relocate === "no" ? false : null,
    },
  });
  return settle(data, error, "talent_save_my_contact");
}

export async function saveSeekerReview(
  _prev: SeekerFormState,
  formData: FormData
): Promise<SeekerFormState> {
  if (!(await getUser())) return formFail(e.authRequired);

  const yearsRaw = text(formData.get("years_experience"));
  const years = yearsRaw === null ? null : Number(yearsRaw);
  if (years !== null && !Number.isFinite(years)) {
    return formFail(e.invalid, { years_experience: e.years });
  }

  const supabase = await createClient();
  // hidden_skills can only hide what the analysis found: the function keeps
  // the ids present in the profile's own skills and drops anything else, so
  // a crafted request cannot add a skill (talent design §2).
  const { data, error } = await supabase.rpc("talent_save_my_review", {
    p_full_name: text(formData.get("full_name")),
    p_headline: text(formData.get("headline")),
    p_city: text(formData.get("city")),
    p_years: years,
    p_about: text(formData.get("about")),
    p_hidden_skills: distinct(formData.getAll("hidden_skills"), 200),
  });
  return settle(data, error, "talent_save_my_review");
}

export async function saveSeekerConsents(
  _prev: SeekerFormState,
  formData: FormData
): Promise<SeekerFormState> {
  if (!(await getUser())) return formFail(e.authRequired);

  const supabase = await createClient();
  // Two consents, read separately. Neither implies the other, and an
  // unchecked box is a "no", never "unchanged".
  const { data, error } = await supabase.rpc("talent_set_my_consents", {
    p_consent_public: formData.get("consent_public") === "on",
    p_consent_offers: formData.get("consent_offers") === "on",
    p_noindex: formData.get("noindex") === "on",
  });
  const state = settle(data, error, "talent_set_my_consents");

  // Same-site paths only (lib/redirects.ts). Outside any try/catch:
  // redirect() works by throwing.
  const target = safeNext(formData.get("redirect_to"), "");
  if (state.ok && target) redirect(target);
  return state;
}

// Explicit consent is the user pressing the button that calls this (D26):
// nothing calls it on their behalf. The database repeats every condition —
// no profile yet, a confirmed auth address, a verified legacy profile with
// the same address — so the page offering the button is not what allows it.
// Linking an old accountless profile takes a second proof of the address
// (0020): a confirmed account is not enough, because an organisation owner
// can create one for any address. This asks seeker-account to email a
// one-time link to the profile's own address; the link opens
// /onboarding/seeker/link/[token], where confirmLegacyLink completes it.
export async function requestLegacyLink(): Promise<SeekerFormState> {
  if (!(await getUser())) return formFail(e.authRequired);

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return formFail(e.authRequired);

  let response: Response;
  try {
    const { url } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/seeker-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "request_link" }),
    });
  } catch (err) {
    console.error("seeker-account unreachable:", err instanceof Error ? err.message : err);
    return formFail(e.generic);
  }

  let body: { ok?: boolean; error?: string; request_id?: string } = {};
  try {
    body = await response.json();
  } catch {
    // Falls through to the generic message.
  }
  if (response.ok && body.ok) return { ok: true, error: null, fieldErrors: {} };
  switch (body.error) {
    case "too_soon":
      return formFail(e.linkTooSoon);
    case "not_available":
      return formFail(e.notAvailable);
    case "auth_required":
      return formFail(e.authRequired);
    default:
      return formFail(withReference(e.linkEmailFailed, body.request_id));
  }
}

// The press on the emailed link's page. The database checks the token, that
// it was issued to this very account, and that it is under an hour old.
export async function confirmLegacyLink(
  _prev: SeekerFormState,
  formData: FormData
): Promise<SeekerFormState> {
  if (!(await getUser())) return formFail(e.authRequired);
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return formFail(e.linkInvalid);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_link_legacy_profile", {
    p_token: token,
  });
  if (error) {
    console.error("talent_link_legacy_profile failed:", error.message);
    return formFail(e.generic);
  }
  const result = data as RpcResult;
  if (!result?.ok) return formFail(e.linkInvalid);
  revalidateSeekerPaths();
  redirect("/onboarding/seeker");
}
