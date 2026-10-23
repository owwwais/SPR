// hr-services — the services hub (CLAUDE.md D34; the D3 exception names it).
//
// Contract: POST JSON { kind, org_id, input } with the caller's own JWT.
//   kind    one of SERVICE_KINDS (_shared/services.ts)
//   org_id  the active organization; authorised here against the caller's
//           membership (owner/admin/hr), never trusted on its own (§10.10)
//   input   validated by that kind's zod schema
// Answers { ok: true, run_id } or { error: <code> }.
//
// One model call per run (§8), structured output validated by zod before it
// is stored (D5), prompts versioned in prompts.ts (D6), and the quota checked
// HERE before the call (D16): each run is one unit of the organization's
// monthly analysis quota, handed back if the model was never reached. A
// daily ceiling per organization caps a runaway loop on top of that.
//
// The arithmetic parts — points and grade, salary position, skill matches —
// are computed in code (_shared/services.ts), never by the model, and the
// model never produces a salary figure. Content touching a protected category
// is dropped before it is stored (_shared/protected-categories.ts).
//
// Privacy (D8): never logs input text or model output, only codes and timings.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY, and GEMINI_API_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  SERVICE_INPUTS,
  SERVICE_OUTPUTS,
  gradeForPoints,
  factorPoints,
  isServiceKind,
  totalPoints,
  type AdAuditOutput,
  type InterviewKitOutput,
  type JobNeedOutput,
  type PayGradeOutput,
  type ServiceKind,
  type TeamOutput,
} from "../_shared/services.ts";
import { touchesProtectedCategory } from "../_shared/protected-categories.ts";
import { makeLogger, newTraceId } from "../_shared/trace.ts";
import { MODEL, SERVICES_PROMPT_VERSION, TEMPERATURE, USER_TEMPLATE_NOTE, systemPrompt } from "./prompts.ts";
import { RESPONSE_SCHEMAS } from "./schema.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Runs per organization per rolling 24 hours, across all services.
const DAILY_RUN_LIMIT = 40;
const WRITER_ROLES = ["owner", "admin", "hr"];

type Job = {
  id: string;
  title: string;
  type: string;
  location: string | null;
  department: string | null;
  description: string;
  requirements: string;
  skills: string[];
  min_years_experience: number | null;
};

function json(status: number, body: Record<string, unknown>, trace?: string): Response {
  return new Response(JSON.stringify(trace ? { ...body, request_id: trace } : body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Data blocks for the model. Tags separate company text from instructions.
const block = (tag: string, value: string | null | undefined) =>
  value && value.trim() ? `<${tag}>\n${value.trim()}\n</${tag}>` : "";

function jobBlock(job: Job): string {
  return [
    block("job_title", job.title),
    block("job_type", job.type),
    block("location", job.location),
    block("department", job.department),
    block("minimum_years_experience", job.min_years_experience?.toString()),
    block("listed_skills", job.skills.join("، ")),
    block("requirements", job.requirements),
    block("description", job.description),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function userMessage(kind: ServiceKind, input: Record<string, unknown>, job: Job | null): string {
  const parts: string[] = [USER_TEMPLATE_NOTE];
  if (kind === "job_need") {
    const i = input as Record<string, string | undefined>;
    parts.push(
      block("title_hint", i.title_hint),
      block("problem_to_solve", i.problem),
      block("expected_outcomes_90_days_and_6_months", i.outcomes),
      block("team_and_reporting", i.team_context),
      block("location", i.location),
      block("work_mode", i.work_mode),
      block("employment_type", i.employment_type),
      block("expected_level", i.level === "unknown" ? "" : i.level),
      block("tools_and_certifications_in_use", i.tools),
      block("existing_description", i.existing_description),
      job ? block("current_job_posting", jobBlock(job)) : ""
    );
  } else if (kind === "pay_grade") {
    if (job) parts.push(block("role", jobBlock(job)));
    else {
      const i = input as { title: string; summary: string };
      parts.push(block("job_title", i.title), block("role_description", i.summary));
    }
  } else if (kind === "team") {
    const i = input as { goal: string; timeline?: string; team_size?: number };
    parts.push(
      block("goal", i.goal),
      block("timeline", i.timeline),
      block("preferred_team_size", i.team_size?.toString())
    );
  } else if (kind === "onboarding") {
    const i = input as { context?: string };
    parts.push(block("role", job ? jobBlock(job) : ""), block("company_context", i.context));
  } else {
    // ad_audit and interview_kit read the job as written.
    parts.push(block(kind === "ad_audit" ? "job_ad" : "role", job ? jobBlock(job) : ""));
  }
  return parts.filter(Boolean).join("\n\n");
}

function titleFor(kind: ServiceKind, input: Record<string, unknown>, job: Job | null): string {
  if (job) return job.title.slice(0, 200);
  const pick = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const raw =
    kind === "team"
      ? pick(input.goal)
      : kind === "pay_grade"
        ? pick(input.title)
        : pick(input.title_hint) || pick(input.problem);
  const firstLine = raw.split(/\n/)[0] ?? "";
  return (firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine) || "—";
}

const clean = (text: string) => !touchesProtectedCategory(text);
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// Post-processing per service. Returns the output to store and how many
// generated items were dropped, or an error code when nothing usable is left.
function finish(
  kind: ServiceKind,
  raw: unknown,
  job: Job | null,
  input: Record<string, unknown>
): { output: Record<string, unknown>; dropped: number } | { error: string } {
  const parsed = SERVICE_OUTPUTS[kind].safeParse(raw);
  if (!parsed.success) return { error: "invalid_output" };
  let dropped = 0;
  const keep = <T,>(items: T[], text: (item: T) => string): T[] => {
    const kept = items.filter((item) => clean(text(item)));
    dropped += items.length - kept.length;
    return kept;
  };

  if (kind === "job_need") {
    const out = parsed.data as JobNeedOutput;
    const result = {
      ...out,
      key_tasks: keep(out.key_tasks, (t) => t.task),
      must_have: keep(out.must_have, (m) => `${m.requirement} ${m.why} ${m.evidence_in_cv}`),
      nice_to_have: keep(out.nice_to_have, (m) => `${m.requirement} ${m.why}`),
      skills: keep(out.skills, (s) => s),
      competencies: out.competencies.map((c) => ({ ...c, indicators: keep(c.indicators, (i) => i) })),
      screening_questions: keep(out.screening_questions, (q) => q),
      interview_focus: keep(out.interview_focus, (f) => f),
    };
    if (result.must_have.length === 0) return { error: "protected_content" };
    return { output: { ...result, dropped }, dropped };
  }

  if (kind === "pay_grade") {
    const out = parsed.data as PayGradeOutput;
    const points = totalPoints(out.factors);
    return {
      output: {
        ...out,
        // Stored with the run so a later change to the plan never rewrites
        // the grade this run gave.
        computed: {
          plan_version: "1",
          points,
          grade: gradeForPoints(points),
          factor_points: Object.fromEntries(out.factors.map((f) => [f.factor, factorPoints(f.factor, f.level)])),
        },
      },
      dropped: 0,
    };
  }

  if (kind === "team") {
    const out = parsed.data as TeamOutput;
    const roles = out.roles
      .map((r) => ({
        ...r,
        responsibilities: keep(r.responsibilities, (x) => x),
        skills: keep(r.skills, (x) => x),
      }))
      .filter((r) => r.skills.length > 0);
    if (roles.length === 0) return { error: "protected_content" };
    return { output: { ...out, roles, dropped }, dropped };
  }

  if (kind === "ad_audit") {
    // The audit is ABOUT problematic wording, so it is not filtered — but a
    // finding must quote words that are really in the ad (evidence rule).
    const out = parsed.data as AdAuditOutput;
    const source = collapse(job ? `${job.title} ${job.requirements} ${job.description}` : "");
    const findings = out.findings.filter((f) => {
      const ok = f.category === "missing_info" ? true : f.quote.trim() !== "" && source.includes(collapse(f.quote));
      if (!ok) dropped++;
      return ok;
    });
    return { output: { ...out, findings, dropped }, dropped };
  }

  if (kind === "interview_kit") {
    const out = parsed.data as InterviewKitOutput;
    const competencies = out.competencies
      .map((c) => ({
        ...c,
        questions: keep(c.questions, (q) => `${q.question} ${q.follow_ups.join(" ")}`),
      }))
      .filter((c) => c.questions.length > 0);
    if (competencies.length === 0) return { error: "protected_content" };
    return { output: { ...out, competencies, probes: keep(out.probes, (p) => p), dropped }, dropped };
  }

  // onboarding: a plan about the work, nothing about the person.
  void input;
  return { output: parsed.data as Record<string, unknown>, dropped: 0 };
}

Deno.serve(async (req) => {
  const trace = newTraceId();
  const log = makeLogger("hr-services", trace);
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, trace);

  let body: { kind?: unknown; org_id?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_input" }, trace);
  }
  const kind = body.kind;
  const orgId = body.org_id;
  if (!isServiceKind(kind) || typeof orgId !== "string" || !UUID_RE.test(orgId)) {
    return json(400, { error: "invalid_input" }, trace);
  }
  const parsedInput = SERVICE_INPUTS[kind].safeParse(body.input ?? {});
  if (!parsedInput.success) return json(400, { error: "invalid_input" }, trace);
  const input = parsedInput.data as Record<string, unknown>;

  // ---- 1. who is asking, for which organization ----------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "auth_required" }, trace);
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const [{ data: userData }, { data: isWriter, error: memberError }] = await Promise.all([
    asCaller.auth.getUser(),
    asCaller.rpc("is_org_member", { p_org: orgId, p_roles: WRITER_ROLES }),
  ]);
  const userId = userData?.user?.id ?? null;
  if (memberError) log.fail("membership", memberError.message, { pg_code: memberError.code });
  if (!userId || isWriter !== true) return json(403, { error: "forbidden" }, trace);

  const admin: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---- 2. the job, read from the caller's own organization -----------
  let job: Job | null = null;
  const jobId = typeof input.job_id === "string" ? input.job_id : null;
  if (jobId) {
    const { data, error } = await admin
      .from("jobs")
      .select("id, title, type, location, department, description, requirements, skills, min_years_experience")
      .eq("id", jobId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      log.fail("job_lookup", error.message, { pg_code: error.code });
      return json(500, { error: "server_error" }, trace);
    }
    if (!data) return json(404, { error: "job_not_found" }, trace);
    job = data as Job;
  }

  // ---- 3. daily ceiling, then the run row ------------------------------
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count: recent, error: countError } = await admin
    .from("service_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since);
  if (countError) {
    log.fail("daily_count", countError.message, { pg_code: countError.code });
    return json(countError.code === "42P01" || countError.code === "PGRST205" ? 503 : 500, {
      error: countError.code === "42P01" || countError.code === "PGRST205" ? "not_configured" : "server_error",
    }, trace);
  }
  if ((recent ?? 0) >= DAILY_RUN_LIMIT) return json(429, { error: "daily_limit" }, trace);

  const { data: run, error: insertError } = await admin
    .from("service_runs")
    .insert({
      org_id: orgId,
      kind,
      job_id: job?.id ?? null,
      title: titleFor(kind, input, job),
      input,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insertError || !run) {
    log.fail("insert_run", insertError?.message ?? "no row", { pg_code: insertError?.code });
    return json(500, { error: "server_error" }, trace);
  }
  const runId = run.id as string;
  const fail = async (status: number, code: string) => {
    await admin
      .from("service_runs")
      .update({ status: "failed", error: code, completed_at: new Date().toISOString() })
      .eq("id", runId);
    return json(status, { error: code, run_id: runId }, trace);
  };

  // ---- 4. quota (D16), before anything is spent -----------------------
  const { data: quota, error: quotaError } = await admin.rpc("consume_analysis_quota", { p_org: orgId });
  if (quotaError) {
    log.fail("quota", quotaError.message, { pg_code: quotaError.code });
    return fail(500, "quota_check_failed");
  }
  if (!(quota as { allowed?: boolean } | null)?.allowed) return fail(429, "quota_exceeded");

  let reachedModel = false;
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const ai = new GoogleGenAI({ apiKey });

    // ---- 5. exactly one model call (§8) -------------------------------
    reachedModel = true;
    const startedAt = Date.now();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: userMessage(kind, input, job) }] }],
      config: {
        systemInstruction: systemPrompt(kind),
        temperature: TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMAS[kind],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    log.step("model", { kind, ms: Date.now() - startedAt });
    const rawText = response.text;
    if (!rawText) return fail(502, "empty_output");

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return fail(502, "invalid_output");
    }

    // ---- 6. validate (D5), post-process, store -------------------------
    const finished = finish(kind, raw, job, input);
    if ("error" in finished) return fail(502, finished.error);

    const { error: updateError } = await admin
      .from("service_runs")
      .update({
        status: "done",
        output: finished.output,
        model: MODEL,
        prompt_version: SERVICES_PROMPT_VERSION,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw new Error(`store failed: ${updateError.message}`);

    log.step("done", { kind, dropped: finished.dropped });
    return json(200, { ok: true, run_id: runId }, trace);
  } catch (err) {
    log.fail("run", (err instanceof Error ? err.message : String(err)).slice(0, 300));
    // Nothing reached the model, so nothing was spent: hand the unit back.
    if (!reachedModel) await admin.rpc("release_analysis_quota", { p_org: orgId });
    return fail(500, reachedModel ? "model_failed" : "server_error");
  }
});
