// send-email — Resend wrapper (CLAUDE.md §3). Looks the applicant up with
// the service role so callers can only name a template + application id,
// never arbitrary recipients or content. Secrets required:
//   RESEND_API_KEY  (Resend)
//   EMAIL_FROM      e.g. "التوظيف <jobs@company.com>" (falls back to Resend dev sender)
//   SITE_URL        optional, enables the tracking link in emails
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildEmail, type EmailKind } from "./templates.ts";

const EMAIL_KINDS: EmailKind[] = [
  "application_received",
  "interview_invited",
  "accepted",
  "rejected",
];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: { kind?: string; application_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const kind = payload.kind as EmailKind;
  const applicationId = payload.application_id;
  if (
    !EMAIL_KINDS.includes(kind) ||
    typeof applicationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(applicationId)
  ) {
    return json(400, { error: "invalid kind or application_id" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("full_name, email, ref_code, jobs(title)")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    console.error("application lookup failed:", appError.message);
    return json(500, { error: "lookup failed" });
  }
  if (!application) return json(404, { error: "application not found" });

  const { data: settings } = await supabase
    .from("settings")
    .select("company_name")
    .eq("id", 1)
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
    companyName: settings?.company_name ?? "",
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
