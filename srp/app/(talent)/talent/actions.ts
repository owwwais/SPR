"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ar } from "@/lib/i18n/ar";

// The talent journey has no session by design — no password, no account — so
// the public token is the capability. It is 128 random bits and only ever
// reaches the person who completed verification.

export type PublishState = { error: string | null };

export async function publishProfile(
  _prev: PublishState,
  formData: FormData
): Promise<PublishState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return { error: ar.talent.errors.server };
  }

  const years = String(formData.get("years_experience") ?? "").trim();
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("talent_publish_profile", {
    p_token: token,
    p_full_name: String(formData.get("full_name") ?? "").trim() || null,
    p_headline: String(formData.get("headline") ?? "").trim() || null,
    p_city: String(formData.get("city") ?? "").trim() || null,
    p_years: years === "" ? null : Number(years),
    p_about: String(formData.get("about") ?? "").trim() || null,
    p_hidden_skills: formData.getAll("hidden_skills").map(String),
    // Two consents, read separately. Neither implies the other.
    p_consent_public: formData.get("consent_public") === "on",
    p_consent_offers: formData.get("consent_offers") === "on",
    p_noindex: formData.get("noindex") === "on",
  });

  if (error) {
    console.error("talent publish failed:", error.message);
    return { error: ar.talent.errors.server };
  }
  const result = data as unknown as { ok: boolean; error?: string };
  if (!result?.ok) {
    return { error: ar.talent.errors.server };
  }

  revalidatePath(`/t/${token}`);
  redirect(`/talent/manage/${token}?published=1`);
}

export async function setVisibility(token: string, visible: boolean) {
  const supabase = createPublicClient();
  const { error } = await supabase.rpc("talent_set_visibility", {
    p_token: token,
    p_visible: visible,
  });
  if (error) console.error("talent visibility failed:", error.message);
  revalidatePath(`/t/${token}`);
  revalidatePath(`/talent/manage/${token}`);
}

export async function deleteProfile(token: string) {
  const supabase = createPublicClient();
  // Immediate and total. A person withdrawing a published CV is exercising a
  // right, not filing a request — so no soft delete and no grace period.
  const { error } = await supabase.rpc("talent_delete_profile", {
    p_token: token,
  });
  if (error) {
    console.error("talent delete failed:", error.message);
    return;
  }
  redirect("/talent?deleted=1");
}

export type UploadState = {
  error: string | null;
  sent: boolean;
  // Carried through to the UI so a rejection is reportable rather than a
  // dead end: "طلبي رُفض" tells nobody anything; "رمز 5f3a1c9b0e، السبب
  // captcha_failed" is a log search. step/detail only ever accompany
  // server_error/not_configured — never captcha_failed — since they are
  // internal step names and error codes, not anything sensitive.
  code?: string;
  requestId?: string;
  step?: string;
  detail?: string;
};

// Mirrors the apply flow: the browser never calls the Edge Function itself.
// Supabase verifies a JWT on every function by default, so a direct fetch
// carrying only `apikey` is rejected with 401 — and routing through the
// server keeps the key out of a request the page composes.
export async function uploadCv(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const t = ar.talent.errors;
  const fail = (
    error: string,
    extra?: { code?: string; requestId?: string; step?: string; detail?: string }
  ): UploadState => ({ error, sent: false, ...extra });

  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) return fail(t.cvRequired);
  if (cv.size > 5 * 1024 * 1024) return fail(t.cvSize);

  let response: Response;
  try {
    const { url, anonKey } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/talent-upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        // Content-Type deliberately unset: fetch derives the multipart
        // boundary from the FormData body.
      },
      body: formData,
    });
  } catch (err) {
    console.error(
      "talent-upload unreachable:",
      err instanceof Error ? err.message : err
    );
    return fail(t.server);
  }

  let body: {
    ok?: boolean;
    error?: string;
    field?: string;
    request_id?: string;
    step?: string;
    detail?: string;
  };
  try {
    body = await response.json();
  } catch (err) {
    console.error(
      "talent-upload returned a non-JSON body:",
      err instanceof Error ? err.message : err
    );
    return fail(t.server);
  }

  if (response.ok && body.ok) return { error: null, sent: true };

  // Machine-readable codes on the wire, Arabic here — the same split the
  // recruitment form uses. captcha_failed and not_configured get their own
  // wording rather than folding into the generic message: they point at two
  // different, checkable causes (see docs/HANDOVER-2026-08.md) rather than
  // "something went wrong, try again", which was true of every failure here
  // before and told nobody which one they were looking at.
  const messages: Record<string, string> = {
    rate_limited: t.rateLimited,
    captcha_failed: t.captchaFailed,
    not_configured: t.notConfigured,
    email_failed: t.server,
    cv: t.cvRequired,
    cv_type: t.cvType,
    cv_size: t.cvSize,
    email: t.invalidEmail,
  };
  const code = body.field ?? body.error;
  return fail(messages[code ?? ""] ?? t.server, {
    code: body.error,
    requestId: body.request_id,
    step: body.step,
    detail: body.detail,
  });
}
