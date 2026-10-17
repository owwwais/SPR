"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { homePath } from "@/lib/seeker";
import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import { ar } from "@/lib/i18n/ar";

// The seeker portal's two writes that are not profile edits (D26/D27).
// Profile edits live in lib/seeker-actions.ts, shared with onboarding.
//
// Neither action writes anything itself. Applying goes through
// submit-application (D15) and deletion through seeker-account, both Edge
// Functions that resolve the user from the access token forwarded here —
// never from an id in the request. What travels is the user's own token,
// never the anon key: profile mode exists precisely because the function
// can then read the stored profile of THAT user and nobody else.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const e = ar.seekerPortal.errors;

export type ApplyWithProfileState =
  | { ok: false; error: string | null; fieldErrors: Record<string, string> }
  | { ok: true; refCode: string };

function fail(
  error: string,
  fieldErrors: Record<string, string> = {}
): ApplyWithProfileState {
  return { ok: false, error, fieldErrors };
}

// The function speaks codes; the page speaks Arabic. Only fields this form
// actually renders are mapped onto inputs — anything else surfaces as the
// form-level message.
function translateFieldErrors(
  raw: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw ?? {})) {
    if (key === "consent") out.consent = e.consentRequired;
    else if (key === "cv_version_id") out.cv_version_id = e.cvVersionInvalid;
    else if (key === "cover_note") out.cover_note = e.coverNote;
    else if (key.startsWith("sq_")) out[key] = e.questionRequired;
  }
  return out;
}

async function accessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function applyWithProfile(
  jobId: string,
  _prev: ApplyWithProfileState,
  formData: FormData
): Promise<ApplyWithProfileState> {
  if (!UUID_RE.test(jobId)) return fail(e.jobClosed);
  const loginPath = `/login?next=${encodeURIComponent(`/me/apply/${jobId}`)}`;

  // getUser() verifies the session with Supabase Auth; getSession() alone
  // only reads the cookie. The token itself is verified again by the
  // function, which is the boundary that matters.
  if (!(await getUser())) redirect(loginPath);
  const token = await accessToken();
  if (!token) redirect(loginPath);

  // Built field by field rather than forwarded whole: profile mode takes the
  // name, email, phone and CV from the stored profile, so nothing typed into
  // the page can stand in for them, and nothing else is sent.
  const body = new FormData();
  body.set("job_id", jobId);
  body.set("mode", "profile");
  const versionId = formData.get("cv_version_id");
  if (typeof versionId === "string" && versionId !== "") {
    body.set("cv_version_id", versionId);
  }
  if (formData.get("consent") === "on") body.set("consent", "on");
  const coverNote = formData.get("cover_note");
  body.set("cover_note", typeof coverNote === "string" ? coverNote : "");
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("sq_") && typeof value === "string") {
      body.append(key, value);
    }
  }

  let response: Response;
  try {
    const { url } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/submit-application`, {
      method: "POST",
      // Content-Type deliberately unset: fetch derives the multipart
      // boundary from the FormData body.
      headers: { Authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
  } catch (err) {
    console.error(
      "submit-application unreachable:",
      err instanceof Error ? err.message : err
    );
    return fail(e.generic);
  }

  let payload: {
    ok?: boolean;
    ref_code?: string;
    error?: string;
    field_errors?: Record<string, string>;
  };
  try {
    payload = await response.json();
  } catch {
    return fail(e.generic);
  }

  // Deliberately no revalidatePath here. Revalidating any path makes Next
  // re-render the page the action came from, and /me/apply would then see
  // the new application and swap the success screen — the only place the
  // reference code is shown right after applying — for "already applied".
  // The /me pages are dynamic (they read the session), so the client router
  // fetches them fresh on the next navigation anyway (staleTimes.dynamic 0).
  if (response.ok && payload.ok && payload.ref_code) {
    return { ok: true, refCode: payload.ref_code };
  }

  // Outside any try/catch: redirect() works by throwing.
  if (payload.error === "auth_required") redirect(loginPath);

  switch (payload.error) {
    case "email_unverified":
      return fail(e.emailUnverified);
    case "profile_incomplete":
      return fail(e.profileIncomplete);
    case "duplicate":
      return fail(e.duplicate);
    case "job_closed":
      return fail(e.jobClosed);
    case "rate_limited":
      return fail(e.rateLimited);
    case "invalid_input":
      return fail(e.invalidInput, translateFieldErrors(payload.field_errors));
    default:
      console.error(
        "submit-application (profile) failed:",
        response.status,
        payload.error ?? "unknown"
      );
      return fail(e.generic);
  }
}

export type DeleteSeekerState = { error: string | null };

// Immediate and total for the seeker's own data (plan §2.4). What happens to
// the auth user is the function's decision, not this action's: it keeps the
// account when the user still wears a company hat, and says which it did.
export async function deleteSeekerAccount(): Promise<DeleteSeekerState> {
  const loginPath = `/login?next=${encodeURIComponent("/me/settings")}`;
  if (!(await getUser())) redirect(loginPath);
  const token = await accessToken();
  if (!token) redirect(loginPath);

  let response: Response;
  try {
    const { url } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/seeker-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "delete" }),
      cache: "no-store",
    });
  } catch (err) {
    console.error(
      "seeker-account unreachable:",
      err instanceof Error ? err.message : err
    );
    return { error: e.generic };
  }

  let payload: { ok?: boolean; account_deleted?: boolean; error?: string };
  try {
    payload = await response.json();
  } catch {
    return { error: e.generic };
  }

  if (payload.error === "auth_required") redirect(loginPath);
  if (!response.ok || !payload.ok) {
    console.error(
      "seeker-account failed:",
      response.status,
      payload.error ?? "unknown"
    );
    return { error: e.generic };
  }

  if (payload.account_deleted) {
    // The auth user no longer exists, so there is no server session left to
    // end: clear this device's cookies only. The active-org cookie goes too,
    // as on any sign-out.
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_ORG_COOKIE);
    redirect("/?account_deleted=1");
  }

  // The account stays — normally for its company hat, so this lands on
  // /admin. homePath() rather than a literal: the function also keeps an
  // account with no live membership (one that decided applications, whose
  // name the status history must keep), and that one belongs on the
  // onboarding chooser, not bounced through /admin. The seeker pages no
  // longer have a profile to show.
  revalidatePath("/me", "layout");
  redirect(await homePath());
}
