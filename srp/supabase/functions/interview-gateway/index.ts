// interview-gateway — the platform's only door to the interview agent (D30,
// docs/INTERVIEW-AGENT-DESIGN.md §3). It holds the signing secret; Next.js
// never does (D3's rule, extended).
//
// Staff call it with their own JWT. Every action is authorised against the
// APPLICATION'S organization through can_manage_application() — owner, admin
// or hr of that org — so a member of one tenant can never dispatch or cancel
// an interview on another tenant's applicant (§10.10).
//
//   { action: "create", application_id, config }
//     Records an assignment, sends the agent the job and the extracted CV —
//     minus the applicant's name, never the file (design §3.5) — and stores
//     the agent's interview id.
//
//   { action: "cancel", assignment_id }
//
// Secrets: INTERVIEW_AGENT_URL, INTERVIEW_AGENT_KEYS ("k1:<secret>", shared
// with the agent's PLATFORM_HMAC_KEYS), plus the platform-injected
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CandidateProfile,
  InterviewConfig,
  InterviewView,
  type CreateInterviewRequest,
} from "../_shared/interview-contract.ts";
import { agentClient } from "../_shared/interview-agent-client.ts";

const UUID = z.uuid();

// What staff choose. Language is fixed server-side (Arabic only, D23).
const ConfigInput = z
  .object({
    question_count: z.number().int(),
    mix: z.object({
      technical: z.number().int(),
      behavioral: z.number().int(),
      gap_probe: z.number().int(),
      coding: z.number().int(),
      warmup: z.number().int(),
    }),
    modes: z.array(z.enum(["text", "voice"])),
    duration_minutes: z.number().int(),
    paste_policy: z.enum(["record", "block"]).default("record"),
    candidate_result: z.enum(["none", "completion", "summary"]).default("completion"),
    accommodations: z
      .object({ extra_time_percent: z.number().int() })
      .default({ extra_time_percent: 0 }),
  })
  .strict();

const Payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), application_id: UUID, config: ConfigInput }),
  z.object({ action: z.literal("cancel"), assignment_id: UUID }),
]);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function canManage(req: Request, applicationId: string): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  try {
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: header } } }
    );
    const { data } = await asCaller.rpc("can_manage_application", {
      p_application_id: applicationId,
    });
    return data === true;
  } catch {
    return false;
  }
}

async function callerId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: header } } }
  );
  const { data } = await asCaller.auth.getUser();
  return data.user?.id ?? null;
}

async function agentError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return `agent ${response.status}: ${body.error ?? "error"}${body.message ? ` (${body.message})` : ""}`;
  } catch {
    return `agent ${response.status}`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: z.infer<typeof Payload>;
  try {
    const parsed = Payload.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "invalid_request" });
    payload = parsed.data;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const agent = agentClient();
  if (!agent) {
    console.error("interview-gateway: INTERVIEW_AGENT_URL / INTERVIEW_AGENT_KEYS not set");
    return json(503, { error: "interviews_not_configured" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---------------------------------------------------------------- cancel
  if (payload.action === "cancel") {
    const { data: assignment } = await admin
      .from("interview_assignments")
      .select("id, application_id, external_interview_id, status")
      .eq("id", payload.assignment_id)
      .maybeSingle();
    // Not found and not allowed look the same, so ids cannot be probed.
    if (!assignment || !(await canManage(req, assignment.application_id))) {
      return json(404, { error: "not_found" });
    }
    if (!assignment.external_interview_id) {
      await admin
        .from("interview_assignments")
        .update({ status: "cancelled", status_at: new Date().toISOString() })
        .eq("id", assignment.id);
      return json(200, { ok: true, status: "cancelled" });
    }

    const response = await agent.call(
      "POST",
      `/v1/platform/interviews/${assignment.external_interview_id}/cancel`
    );
    if (!response.ok) {
      const message = await agentError(response);
      console.error("interview cancel failed:", message);
      return json(response.status === 409 ? 409 : 502, { error: "agent_refused", message });
    }
    const view = InterviewView.parse(await response.json());
    await admin
      .from("interview_assignments")
      .update({ status: view.status, status_at: view.updated_at, last_error: null })
      .eq("id", assignment.id);
    return json(200, { ok: true, status: view.status });
  }

  // ---------------------------------------------------------------- create
  if (!(await canManage(req, payload.application_id))) {
    return json(404, { error: "not_found" });
  }

  const config = InterviewConfig.safeParse({ ...payload.config, language: "ar" });
  if (!config.success) {
    return json(400, {
      error: "invalid_config",
      message: config.error.issues.map((issue) => issue.message).join("; "),
    });
  }

  const { data: application, error: lookupError } = await admin
    .from("applications")
    .select(
      "id, org_id, analysis_status, organizations(status), jobs(title, type, location, min_years_experience, skills, requirements, description), ai_evaluations(extracted)"
    )
    .eq("id", payload.application_id)
    .maybeSingle();
  if (lookupError || !application) {
    console.error("application lookup failed:", lookupError?.message);
    return json(404, { error: "not_found" });
  }

  const org = application.organizations as unknown as { status: string } | null;
  if (!org || !["trial", "active"].includes(org.status)) {
    return json(403, { error: "organization_inactive" });
  }

  // The questions are built from the extracted CV, so there has to be one.
  // ai_evaluations is one-to-one (unique application_id), which PostgREST
  // embeds as an object; accept an array too rather than depend on it.
  type Evaluation = { extracted: Record<string, unknown> };
  const embedded = application.ai_evaluations as unknown as Evaluation | Evaluation[] | null;
  const evaluation = Array.isArray(embedded) ? embedded[0] : embedded;
  if (application.analysis_status !== "done" || !evaluation) {
    return json(409, { error: "analysis_required" });
  }

  // Data minimisation (design §3.5): copy only the profile fields the
  // contract allows. full_name is not among them, and the contract is strict,
  // so the agent would refuse it even if this line were wrong.
  const extracted = evaluation.extracted;
  const profile = CandidateProfile.safeParse({
    total_years_experience: extracted.total_years_experience,
    experiences: extracted.experiences,
    education: extracted.education,
    skills: extracted.skills,
    languages: extracted.languages,
    cv_language: extracted.cv_language,
  });
  if (!profile.success) {
    console.error("extracted profile does not fit the contract for", application.id);
    return json(422, { error: "profile_unusable" });
  }

  const job = application.jobs as unknown as {
    title: string;
    type: CreateInterviewRequest["job"]["type"];
    location: string | null;
    min_years_experience: number | null;
    skills: string[];
    requirements: string;
    description: string;
  };

  const createdBy = await callerId(req);
  const { data: assignment, error: insertError } = await admin
    .from("interview_assignments")
    .insert({
      application_id: application.id,
      modes: config.data.modes,
      question_count: config.data.question_count,
      duration_minutes: config.data.duration_minutes,
      candidate_result: config.data.candidate_result,
      paste_policy: config.data.paste_policy,
      config: config.data,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (insertError || !assignment) {
    if (insertError?.code === "23505") return json(409, { error: "interview_exists" });
    console.error("assignment insert failed:", insertError?.message);
    return json(500, { error: "insert_failed" });
  }

  const request: CreateInterviewRequest = {
    external_ref: assignment.id,
    candidate_ref: await agent.candidateRef(application.id),
    job: {
      title: job.title,
      type: job.type,
      location: job.location,
      min_years_experience: job.min_years_experience ?? 0,
      skills: job.skills ?? [],
      requirements: job.requirements,
      description: job.description ?? "",
    },
    candidate_profile: profile.data,
    config: config.data,
  };

  let response: Response;
  try {
    // The assignment id doubles as the idempotency key: a retried create can
    // never produce a second interview on the agent.
    response = await agent.call("POST", "/v1/platform/interviews", request, assignment.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("interview_assignments")
      .update({ status: "failed", last_error: `agent unreachable: ${message}`.slice(0, 300) })
      .eq("id", assignment.id);
    return json(502, { error: "agent_unreachable" });
  }

  if (!response.ok) {
    const message = await agentError(response);
    console.error("interview create refused:", message);
    await admin
      .from("interview_assignments")
      .update({ status: "failed", last_error: message.slice(0, 300) })
      .eq("id", assignment.id);
    return json(502, { error: "agent_refused", message });
  }

  const view = InterviewView.parse(await response.json());
  await admin
    .from("interview_assignments")
    .update({
      external_interview_id: view.id,
      status: view.status,
      status_at: view.updated_at,
      last_error: null,
    })
    .eq("id", assignment.id);

  return json(201, { ok: true, assignment_id: assignment.id, status: view.status });
});
