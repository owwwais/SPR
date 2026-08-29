// send-email — Resend wrapper (CLAUDE.md §3). Looks the recipient up with
// the service role so callers can only name a template + a row id, never
// arbitrary recipients or content. Secrets required:
//   RESEND_API_KEY  (Resend)
//   EMAIL_FROM      e.g. "التوظيف <jobs@company.com>" (falls back to Resend dev sender)
//   SITE_URL        optional, enables the tracking link in emails
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  buildEmail,
  buildTalentVerifyEmail,
  type EmailKind,
} from "./templates.ts";

// Applicant templates: the recipient is derived from the application row, so
// these are safe to invoke with the anon key from a server action.
const APPLICANT_KINDS: EmailKind[] = [
  "application_received",
  "interview_invited",
  "accepted",
  "rejected",
];

// The invitation template is different: it carries a one-time accept token,
// so it is service-role only. manage-users invokes it after it has already
// checked that the caller administers the organization.
function isServiceRoleCaller(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  return header === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
}

// Arabic role names. Duplicated from lib/i18n/ar.ts rather than imported:
// this function must stay deployable on its own, and these four strings are
// the entire overlap.
const ROLE_LABELS: Record<string, string> = {
  owner: "المالك",
  admin: "مدير",
  hr: "موارد بشرية",
  viewer: "مطّلع",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: {
    kind?: string;
    application_id?: string;
    invitation_id?: string;
    token?: string;
    email?: string;
    url?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const kind = payload.kind as EmailKind;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const resendKeyEarly = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const siteUrlEarly = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? null;

  // ---- talent_verify: the companion product's address check ----
  // Service role only, like every other kind here: the caller is
  // talent-upload, never a browser.
  if (kind === "talent_verify") {
    if (!isServiceRoleCaller(req)) {
      return json(403, { error: "service role only" });
    }
    const to = payload.email;
    const verifyUrl = payload.url;
    if (!to || !verifyUrl) {
      return json(400, { error: "email and url required" });
    }
    if (!resendKeyEarly) {
      console.error("RESEND_API_KEY is not configured");
      return json(500, { error: "email not configured" });
    }
    const { subject, html } = buildTalentVerifyEmail(verifyUrl);
    const { error: sendError } = await new Resend(resendKeyEarly).emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    if (sendError) {
      console.error("resend send failed:", sendError.message);
      return json(502, { error: "send failed" });
    }
    return json(200, { ok: true });
  }

  // ---- invitation: colleague, not applicant ----
  if (kind === "invitation") {
    if (!isServiceRoleCaller(req)) {
      return json(403, { error: "service role only" });
    }
    const invitationId = payload.invitation_id;
    const token = payload.token;
    if (
      typeof invitationId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(invitationId) ||
      typeof token !== "string" ||
      token.length < 20
    ) {
      return json(400, { error: "invalid invitation_id or token" });
    }
    if (!resendKeyEarly) {
      console.error("RESEND_API_KEY is not configured");
      return json(500, { error: "email not configured" });
    }

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .select("email, role, organizations(name)")
      .eq("id", invitationId)
      .maybeSingle();
    if (inviteError) {
      console.error("invitation lookup failed:", inviteError.message);
      return json(500, { error: "lookup failed" });
    }
    if (!invitation) return json(404, { error: "invitation not found" });

    const inviteOrg = invitation.organizations as unknown as {
      name: string;
    } | null;
    const { subject, html } = buildEmail("invitation", {
      fullName: "",
      jobTitle: "",
      refCode: "",
      trackUrl: null,
      companyName: inviteOrg?.name ?? "",
      inviteUrl: siteUrlEarly ? `${siteUrlEarly}/invite/${token}` : null,
      roleLabel: ROLE_LABELS[invitation.role] ?? "",
    });

    const { error: inviteSendError } = await new Resend(
      resendKeyEarly
    ).emails.send({ from: fromAddress, to: invitation.email, subject, html });
    if (inviteSendError) {
      console.error("resend send failed:", inviteSendError.message);
      return json(502, { error: "send failed" });
    }
    return json(200, { ok: true });
  }

  // ---- applicant templates ----
  const applicationId = payload.application_id;
  if (
    !APPLICANT_KINDS.includes(kind) ||
    typeof applicationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(applicationId)
  ) {
    return json(400, { error: "invalid kind or application_id" });
  }

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("full_name, email, ref_code, org_id, jobs(title)")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    console.error("application lookup failed:", appError.message);
    return json(500, { error: "lookup failed" });
  }
  if (!application) return json(404, { error: "application not found" });

  // The sender identity now comes from the applicant's own organization —
  // the single `settings` row is gone (0006). An applicant to company A must
  // never see company B's name on the email.
  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", application.org_id)
    .maybeSingle();

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("RESEND_API_KEY is not configured");
    return json(500, { error: "email not configured" });
  }
  const from = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? null;

  const job = application.jobs as unknown as { title: string } | null;
  const { subject, html } = buildEmail(kind, {
    fullName: application.full_name,
    jobTitle: job?.title ?? "",
    refCode: application.ref_code,
    trackUrl: siteUrl ? `${siteUrl}/track/${application.ref_code}` : null,
    companyName: organization?.name ?? "",
  });

  const resend = new Resend(resendKey);
  const { error: sendError } = await resend.emails.send({
    from,
    to: application.email,
    subject,
    html,
  });
  if (sendError) {
    // Never log applicant PII beyond what's needed (D8).
    console.error("resend send failed:", sendError.message);
    return json(502, { error: "send failed" });
  }

  return json(200, { ok: true });
});
