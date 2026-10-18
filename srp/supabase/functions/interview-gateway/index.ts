// interview-gateway — the platform's only door to the interview agent (D30,
// docs/INTERVIEW-AGENT-DESIGN.md §3). It holds the signing secret; Next.js
// never does (D3's rule, extended).
//
// Staff call it with their own JWT. Every action is authorised against the
// organization of the row it touches — the JOB's for a question bank, the
// APPLICATION's for an interview — never against "staff in general", so a
// member of one tenant can never read or change another tenant's bank or
// interview (§10.10). Not visible and not allowed both answer 404, so ids
// cannot be probed.
//
// Job core banks (I1) — authorised by can_manage_job(), except bank_get,
// which any member who can read the bank row may call (viewers included):
//   { action: "bank_create", job_id }
//   { action: "bank_get",    bank_id }              interview_job_banks.id
//   { action: "bank_edit",   bank_id, edit }        contract BankEdit
//   { action: "bank_lock",   bank_id }
//   { action: "bank_retry",  bank_id }
//   -> { ok, bank: { id, job_id, version, status, bank_hash, locked_at,
//                    failure, questions, regenerations_left } }
//
// Interviews — authorised by can_manage_application(), except
// interview_bank_get, which any member who can read the assignment may call:
//   { action: "create", application_id, config }   -> { ok, assignment_id, status }
//   { action: "cancel", assignment_id }            -> { ok, status }
//   { action: "interview_bank_get",  assignment_id }
//   { action: "interview_bank_edit", assignment_id, edit }   gap probes only
//   { action: "interview_bank_lock", assignment_id }
//   -> { ok, interview: { assignment_id, status, gap_probes, plan, plan_hash,
//                         locked_at, regenerations_left } }
//
// Cost (D33): anything that may make the agent call the model — generating
// a bank, retrying one, regenerating a question, creating an interview —
// needs a live organization (403 organization_inactive) and an allowance
// other than 0 (402 interviews_not_in_plan), checked here before the agent
// is called. The agent enforces the allowance itself as well; this check only
// spares it a request it would refuse.
//
// Errors: { error: code }. The agent's 402/403/404/409/422/429/502/503 pass
// through with its status and code; its `message` never reaches the client.
// A network failure is 502 agent_unreachable.
//
// Secrets: INTERVIEW_AGENT_URL, INTERVIEW_AGENT_KEYS ("k1:<secret>", shared
// with the agent's PLATFORM_HMAC_KEYS), INTERVIEW_REF_SECRET (the key for
// the opaque candidate/tenant references; never rotated), plus the platform-injected
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  BankEdit,
  CandidateProfile,
  CreateJobBankRequest,
  InterviewBankView,
  InterviewConfig,
  InterviewView,
  JobBankView,
  JobContext,
  type BankQuestionView,
  type CreateInterviewRequest,
  type TenantContext,
} from "../_shared/interview-contract.ts";
import { agentRefsConfigured, agentClient, type AgentClient } from "../_shared/interview-agent-client.ts";

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
  z.object({ action: z.literal("bank_create"), job_id: UUID }),
  z.object({ action: z.literal("bank_get"), bank_id: UUID }),
  z.object({ action: z.literal("bank_edit"), bank_id: UUID, edit: BankEdit }),
  z.object({ action: z.literal("bank_lock"), bank_id: UUID }),
  z.object({ action: z.literal("bank_retry"), bank_id: UUID }),
  z.object({ action: z.literal("create"), application_id: UUID, config: ConfigInput }),
  z.object({ action: z.literal("cancel"), assignment_id: UUID }),
  z.object({ action: z.literal("interview_bank_get"), assignment_id: UUID }),
  z.object({
    action: z.literal("interview_bank_edit"),
    assignment_id: UUID,
    edit: BankEdit,
  }),
  z.object({ action: z.literal("interview_bank_lock"), assignment_id: UUID }),
]);
type Payload = z.infer<typeof Payload>;

const LIVE_ORG_STATUSES = ["trial", "active"];

// A row the agent never acknowledged and nobody is still waiting on: the
// agent call times out after 15 s, so anything older than this was left
// behind by a request that died mid-way. Without this, such a row would hold
// the job's one in-progress slot (or the application's one live interview)
// forever.
const STALE_CREATION_MS = 2 * 60 * 1000;

// Statuses whose agent answer staff can act on; anything else means this
// gateway or the deployment is wrong, and reads as the agent refusing.
const PASSTHROUGH_STATUSES = new Set([402, 403, 404, 409, 422, 429, 502, 503]);
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type OrgRow = {
  id: string;
  status: string;
  monthly_interview_quota: number | null;
  deleted_at: string | null;
};
const ORG_COLUMNS = "id, status, monthly_interview_quota, deleted_at";

type PlatformBankStatus =
  | "generating"
  | "awaiting_review"
  | "locked"
  | "failed"
  | "superseded";

type BankRow = {
  id: string;
  org_id: string;
  job_id: string;
  external_bank_id: string | null;
  version: number;
  status: PlatformBankStatus;
  bank_hash: string | null;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
};
const BANK_COLUMNS =
  "id, org_id, job_id, external_bank_id, version, status, bank_hash, locked_at, last_error, created_at";

type JobRow = {
  id: string;
  org_id: string;
  title: string;
  type: JobContext["type"];
  location: string | null;
  min_years_experience: number | null;
  skills: string[] | null;
  requirements: string;
  description: string | null;
  deleted_at: string | null;
};
const JOB_COLUMNS =
  "id, org_id, title, type, location, min_years_experience, skills, requirements, description, deleted_at";

type AssignmentRow = {
  id: string;
  org_id: string;
  application_id: string;
  external_interview_id: string | null;
  status: string;
  bank_hash: string | null;
  bank_locked_at: string | null;
};
const ASSIGNMENT_COLUMNS =
  "id, org_id, application_id, external_interview_id, status, bank_hash, bank_locked_at";

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string): Response {
  return json(status, { error });
}

type BankPayload = {
  id: string;
  job_id: string;
  version: number;
  status: PlatformBankStatus;
  bank_hash: string | null;
  locked_at: string | null;
  failure: string | null;
  questions: BankQuestionView[];
  regenerations_left: number;
};

// The platform id goes out as `id`; the agent's id never leaves the server.
function bankPayload(row: BankRow, view: JobBankView | null): BankPayload {
  return {
    id: row.id,
    job_id: row.job_id,
    version: row.version,
    status: row.status,
    bank_hash: row.bank_hash,
    locked_at: row.locked_at,
    failure: view ? view.failure : row.last_error,
    questions: view ? view.questions : [],
    regenerations_left: view ? view.regenerations_left : 0,
  };
}

function bankReply(status: number, row: BankRow, view: JobBankView | null): Response {
  return json(status, { ok: true, bank: bankPayload(row, view) });
}

function interviewReply(row: AssignmentRow, view: InterviewBankView | null): Response {
  return json(200, {
    ok: true,
    interview: {
      assignment_id: row.id,
      status: view ? view.status : row.status,
      gap_probes: view ? view.gap_probes : [],
      plan: view ? view.plan : null,
      plan_hash: view ? view.plan_hash : row.bank_hash,
      locked_at: view ? view.locked_at : row.bank_locked_at,
      regenerations_left: view ? view.regenerations_left : 0,
    },
  });
}

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

type AgentOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

// One call to the agent, its answer validated against the contract. Logs
// carry the route, the status and the error code only — never a body, which
// can hold job text or questions.
async function callAgent<S extends z.ZodType>(
  agent: AgentClient,
  schema: S,
  method: string,
  path: string,
  route: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<AgentOutcome<z.infer<S>>> {
  let response: Response;
  try {
    // A review edit may be "generate a replacement", which waits for one
    // model call on the agent (its own ceiling is 45 s). Giving up sooner
    // would report agent_unreachable while the agent still stores the
    // replacement, so edits get room for that call; everything else keeps
    // the short default.
    const timeoutMs = method === "PATCH" ? 55_000 : undefined;
    response = await agent.call(method, path, body, idempotencyKey, timeoutMs);
  } catch (err) {
    console.error(
      `interview-gateway: agent unreachable on ${method} ${route}:`,
      err instanceof Error ? err.name : "error"
    );
    return { ok: false, status: 502, code: "agent_unreachable" };
  }

  if (!response.ok) {
    let code = "agent_error";
    try {
      const answer = (await response.json()) as { error?: unknown };
      if (typeof answer.error === "string" && ERROR_CODE.test(answer.error)) {
        code = answer.error;
      }
    } catch {
      // No JSON body: keep the generic code.
    }
    console.error(`interview-gateway: agent answered ${response.status} ${code} on ${method} ${route}`);
    if (PASSTHROUGH_STATUSES.has(response.status)) {
      return { ok: false, status: response.status, code };
    }
    return { ok: false, status: 502, code: "agent_refused" };
  }

  let raw: unknown = undefined;
  try {
    raw = await response.json();
  } catch {
    // Falls through to the schema check, which refuses undefined.
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`interview-gateway: agent answer to ${method} ${route} does not match the contract`);
    return { ok: false, status: 502, code: "agent_invalid_response" };
  }
  return { ok: true, data: parsed.data as z.infer<S> };
}

// The contract caps the allowance at 100000 a month; a larger column value
// is, for every practical purpose, the same ceiling, and sending it as-is
// would make the agent refuse the whole request.
const MAX_CONTRACT_ALLOWANCE = 100000;

async function tenantContext(agent: AgentClient, org: OrgRow): Promise<TenantContext> {
  const quota = org.monthly_interview_quota;
  return {
    ref: await agent.tenantRef(org.id),
    monthly_interview_allowance: quota === null ? null : Math.min(quota, MAX_CONTRACT_ALLOWANCE),
  };
}

// ---------------------------------------------------------------------------
// The caller
// ---------------------------------------------------------------------------

// A client that acts as the caller, so RLS and the security definer gates
// answer for THEM rather than for the service role.
function callerClient(req: Request): SupabaseClient | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: header } },
  });
}

async function callerGate(
  caller: SupabaseClient,
  fn: "can_manage_job" | "can_manage_application",
  args: Record<string, string>
): Promise<boolean> {
  try {
    const { data, error } = await caller.rpc(fn, args);
    return !error && data === true;
  } catch {
    return false;
  }
}

// Whether the caller's own RLS lets them read this row. The org filter is
// explicit as well (the isolation invariant: two layers, always).
async function callerCanSee(
  caller: SupabaseClient,
  table: "interview_job_banks" | "interview_assignments",
  id: string,
  orgId: string
): Promise<boolean> {
  try {
    const { data, error } = await caller
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

async function callerId(caller: SupabaseClient): Promise<string | null> {
  const { data } = await caller.auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Shared lookups and gates
// ---------------------------------------------------------------------------

async function loadOrg(admin: SupabaseClient, orgId: string): Promise<OrgRow | null> {
  const { data } = await admin
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

// The D33 gate for anything that may cost a model call.
function costGate(org: OrgRow | null): Response | null {
  if (!org || org.deleted_at !== null || !LIVE_ORG_STATUSES.includes(org.status)) {
    return fail(403, "organization_inactive");
  }
  if (org.monthly_interview_quota === 0) return fail(402, "interviews_not_in_plan");
  return null;
}

function staleBefore(): string {
  return new Date(Date.now() - STALE_CREATION_MS).toISOString();
}

function isStale(createdAt: string): boolean {
  return Date.parse(createdAt) < Date.now() - STALE_CREATION_MS;
}

// ---------------------------------------------------------------------------
// Job banks
// ---------------------------------------------------------------------------

async function loadBank(admin: SupabaseClient, bankId: string): Promise<BankRow | null> {
  const { data } = await admin
    .from("interview_job_banks")
    .select(BANK_COLUMNS)
    .eq("id", bankId)
    .maybeSingle();
  return (data as BankRow | null) ?? null;
}

// Fails creations of this job that the agent never acknowledged and that no
// request is waiting on any more (see STALE_CREATION_MS).
async function expireStaleCreations(admin: SupabaseClient, jobId: string, orgId: string) {
  const { error } = await admin
    .from("interview_job_banks")
    .update({ status: "failed", last_error: "agent_unreachable" })
    .eq("job_id", jobId)
    .eq("org_id", orgId)
    .eq("status", "generating")
    .is("external_bank_id", null)
    .lt("created_at", staleBefore());
  if (error) console.error("interview-gateway: stale bank cleanup failed:", error.code);
}

// Copies the agent's view of a bank onto the platform row. The version is
// NOT copied: the platform counts versions per job, while each platform row
// is its own external_ref on the agent, whose count therefore stays at 1.
async function syncBank(
  admin: SupabaseClient,
  row: BankRow,
  view: JobBankView
): Promise<BankRow> {
  const patch = {
    ...(row.external_bank_id === null ? { external_bank_id: view.id } : {}),
    // 'superseded' exists only on the platform; the agent keeps calling a
    // superseded bank 'locked', which it still is.
    status: row.status === "superseded" ? row.status : view.status,
    bank_hash: view.bank_hash,
    locked_at: view.locked_at,
    question_count: view.questions.filter((q) => q.status !== "removed").length,
    approved_count: view.questions.filter((q) => q.status === "approved").length,
    last_error: view.failure,
  };
  const { data, error } = await admin
    .from("interview_job_banks")
    .update(patch)
    .eq("id", row.id)
    .eq("org_id", row.org_id)
    .select(BANK_COLUMNS)
    .single();
  if (error || !data) {
    // The agent is the source of truth for the questions; a failed copy is
    // repaired by the next sync, so the caller still gets the agent's view.
    console.error("interview-gateway: bank sync failed for", row.id, error?.code);
    return {
      ...row,
      external_bank_id: row.external_bank_id ?? view.id,
      status: patch.status,
      bank_hash: view.bank_hash,
      locked_at: view.locked_at,
      last_error: view.failure,
    };
  }
  return data as BankRow;
}

// Creates the next version of a job's core bank and asks the agent to
// generate it. The caller has already been authorised for the job and has
// passed the cost gate.
async function createBank(
  admin: SupabaseClient,
  agent: AgentClient,
  job: JobRow,
  org: OrgRow,
  createdBy: string | null
): Promise<Response> {
  const jobContext = JobContext.safeParse({
    title: job.title,
    type: job.type,
    location: job.location,
    min_years_experience: job.min_years_experience ?? 0,
    skills: job.skills ?? [],
    requirements: job.requirements,
    description: job.description ?? "",
  });
  if (!jobContext.success) return fail(422, "job_unusable");

  await expireStaleCreations(admin, job.id, job.org_id);

  const { data: inProgress } = await admin
    .from("interview_job_banks")
    .select("id")
    .eq("job_id", job.id)
    .eq("org_id", job.org_id)
    .in("status", ["generating", "awaiting_review"])
    .limit(1);
  if (inProgress && inProgress.length > 0) return fail(409, "bank_in_progress");

  const { data: newest } = await admin
    .from("interview_job_banks")
    .select("version")
    .eq("job_id", job.id)
    .eq("org_id", job.org_id)
    .order("version", { ascending: false })
    .limit(1);
  const version = ((newest?.[0] as { version: number } | undefined)?.version ?? 0) + 1;

  // org_id is derived from the job by trigger (0021), never supplied here.
  const { data: inserted, error: insertError } = await admin
    .from("interview_job_banks")
    .insert({ job_id: job.id, version, status: "generating", created_by: createdBy })
    .select(BANK_COLUMNS)
    .single();
  if (insertError || !inserted) {
    // The one-in-progress index, or a concurrent create taking this version.
    if (insertError?.code === "23505") return fail(409, "bank_in_progress");
    console.error("interview-gateway: bank insert failed:", insertError?.code);
    return fail(500, "insert_failed");
  }
  const row = inserted as BankRow;

  const request = CreateJobBankRequest.safeParse({
    external_ref: row.id,
    tenant: await tenantContext(agent, org),
    job: jobContext.data,
  });
  if (!request.success) {
    await markBankFailed(admin, row, "invalid_request");
    return fail(422, "job_unusable");
  }

  // The row id is both the external_ref and the idempotency key: a retried
  // request can never make the agent generate this version twice.
  const outcome = await callAgent(
    agent,
    JobBankView,
    "POST",
    "/v1/platform/job-banks",
    "/job-banks",
    request.data,
    row.id
  );
  if (!outcome.ok) {
    await markBankFailed(admin, row, outcome.code);
    return fail(outcome.status, outcome.code);
  }
  const synced = await syncBank(admin, row, outcome.data);
  return bankReply(201, synced, outcome.data);
}

async function markBankFailed(admin: SupabaseClient, row: BankRow, code: string) {
  const { error } = await admin
    .from("interview_job_banks")
    .update({ status: "failed", last_error: code })
    .eq("id", row.id)
    .eq("org_id", row.org_id);
  if (error) console.error("interview-gateway: could not mark bank failed:", row.id, error.code);
}

async function loadJob(admin: SupabaseClient, jobId: string, orgId?: string): Promise<JobRow | null> {
  let query = admin.from("jobs").select(JOB_COLUMNS).eq("id", jobId);
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query.maybeSingle();
  const job = (data as JobRow | null) ?? null;
  return job && job.deleted_at === null ? job : null;
}

async function handleBankCreate(
  req: Request,
  admin: SupabaseClient,
  agent: AgentClient,
  jobId: string
): Promise<Response> {
  const caller = callerClient(req);
  if (!caller || !(await callerGate(caller, "can_manage_job", { p_job_id: jobId }))) {
    return fail(404, "not_found");
  }
  const job = await loadJob(admin, jobId);
  if (!job) return fail(404, "not_found");

  const org = await loadOrg(admin, job.org_id);
  const refused = costGate(org);
  if (refused || !org) return refused ?? fail(403, "organization_inactive");

  return createBank(admin, agent, job, org, await callerId(caller));
}

async function handleBankAction(
  req: Request,
  admin: SupabaseClient,
  agent: AgentClient,
  payload: Extract<Payload, { action: "bank_get" | "bank_edit" | "bank_lock" | "bank_retry" }>
): Promise<Response> {
  const caller = callerClient(req);
  let row = await loadBank(admin, payload.bank_id);
  if (!caller || !row) return fail(404, "not_found");

  const allowed =
    payload.action === "bank_get"
      ? await callerCanSee(caller, "interview_job_banks", row.id, row.org_id)
      : await callerGate(caller, "can_manage_job", { p_job_id: row.job_id });
  if (!allowed) return fail(404, "not_found");

  // A creation that died mid-way shows as failed (and becomes retryable)
  // instead of generating forever.
  if (row.status === "generating" && row.external_bank_id === null && isStale(row.created_at)) {
    await expireStaleCreations(admin, row.job_id, row.org_id);
    row = (await loadBank(admin, row.id)) ?? row;
  }

  const costly =
    payload.action === "bank_retry" ||
    (payload.action === "bank_edit" && payload.edit.op === "regenerate");
  let org: OrgRow | null = null;
  if (costly) {
    org = await loadOrg(admin, row.org_id);
    const refused = costGate(org);
    if (refused) return refused;
  }

  // ------------------------------------------------------------ bank_get
  if (payload.action === "bank_get") {
    if (row.external_bank_id === null) return bankReply(200, row, null);
    const outcome = await callAgent(
      agent,
      JobBankView,
      "GET",
      `/v1/platform/job-banks/${row.external_bank_id}`,
      "/job-banks/:id"
    );
    if (!outcome.ok) return fail(outcome.status, outcome.code);
    return bankReply(200, await syncBank(admin, row, outcome.data), outcome.data);
  }

  // ---------------------------------------------------------- bank_retry
  if (payload.action === "bank_retry") {
    if (row.status !== "failed") return fail(409, "invalid_transition");

    // The agent never acknowledged this version, so there is nothing on the
    // agent to retry: generate the job's next version instead. The failed
    // row stays as the record of what happened.
    if (row.external_bank_id === null) {
      const job = await loadJob(admin, row.job_id, row.org_id);
      if (!job) return fail(404, "not_found");
      if (!org) return fail(403, "organization_inactive");
      return createBank(admin, agent, job, org, await callerId(caller));
    }

    // Take the job's in-progress slot BEFORE asking the agent, so a retry
    // cannot race a newer version into two banks under review.
    const { data: claimed, error: claimError } = await admin
      .from("interview_job_banks")
      .update({ status: "generating", last_error: null })
      .eq("id", row.id)
      .eq("org_id", row.org_id)
      .eq("status", "failed")
      .select(BANK_COLUMNS)
      .maybeSingle();
    if (claimError?.code === "23505") return fail(409, "bank_in_progress");
    if (claimError || !claimed) return fail(409, "invalid_transition");

    const outcome = await callAgent(
      agent,
      JobBankView,
      "POST",
      `/v1/platform/job-banks/${row.external_bank_id}/retry`,
      "/job-banks/:id/retry"
    );
    if (!outcome.ok) {
      // Put the row back the way the agent sees it — the refusal may have
      // come after the agent did change state — or, if the agent cannot even
      // be read, the way it was.
      const current = await callAgent(
        agent,
        JobBankView,
        "GET",
        `/v1/platform/job-banks/${row.external_bank_id}`,
        "/job-banks/:id"
      );
      if (current.ok) {
        await syncBank(admin, claimed as BankRow, current.data);
      } else {
        await admin
          .from("interview_job_banks")
          .update({ status: "failed", last_error: row.last_error })
          .eq("id", row.id)
          .eq("org_id", row.org_id);
      }
      return fail(outcome.status, outcome.code);
    }
    return bankReply(200, await syncBank(admin, claimed as BankRow, outcome.data), outcome.data);
  }

  // A bank the agent never acknowledged has no questions to edit or lock.
  if (row.external_bank_id === null) return fail(409, "invalid_transition");

  // ----------------------------------------------------------- bank_edit
  if (payload.action === "bank_edit") {
    const outcome = await callAgent(
      agent,
      JobBankView,
      "PATCH",
      `/v1/platform/job-banks/${row.external_bank_id}`,
      "/job-banks/:id",
      payload.edit
    );
    if (!outcome.ok) return fail(outcome.status, outcome.code);
    return bankReply(200, await syncBank(admin, row, outcome.data), outcome.data);
  }

  // ----------------------------------------------------------- bank_lock
  const outcome = await callAgent(
    agent,
    JobBankView,
    "POST",
    `/v1/platform/job-banks/${row.external_bank_id}/lock`,
    "/job-banks/:id/lock"
  );
  if (!outcome.ok) return fail(outcome.status, outcome.code);
  const synced = await syncBank(admin, row, outcome.data);
  if (synced.status === "locked") {
    // The newest locked version is the job's current bank; older locked
    // versions stay readable, marked as replaced.
    const { error } = await admin
      .from("interview_job_banks")
      .update({ status: "superseded" })
      .eq("job_id", synced.job_id)
      .eq("org_id", synced.org_id)
      .eq("status", "locked")
      .lt("version", synced.version);
    if (error) console.error("interview-gateway: superseding older banks failed:", error.code);
  }
  return bankReply(200, synced, outcome.data);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

async function loadAssignment(
  admin: SupabaseClient,
  assignmentId: string
): Promise<AssignmentRow | null> {
  const { data } = await admin
    .from("interview_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("id", assignmentId)
    .maybeSingle();
  return (data as AssignmentRow | null) ?? null;
}

async function handleCreate(
  req: Request,
  admin: SupabaseClient,
  agent: AgentClient,
  payload: Extract<Payload, { action: "create" }>
): Promise<Response> {
  const caller = callerClient(req);
  if (
    !caller ||
    !(await callerGate(caller, "can_manage_application", {
      p_application_id: payload.application_id,
    }))
  ) {
    return fail(404, "not_found");
  }

  const config = InterviewConfig.safeParse({ ...payload.config, language: "ar" });
  if (!config.success) return fail(400, "invalid_config");

  const { data: found, error: lookupError } = await admin
    .from("applications")
    .select("id, org_id, job_id, analysis_status, ai_evaluations(extracted)")
    .eq("id", payload.application_id)
    .maybeSingle();
  if (lookupError || !found) {
    if (lookupError) console.error("interview-gateway: application lookup failed:", lookupError.code);
    return fail(404, "not_found");
  }
  const application = found as {
    id: string;
    org_id: string;
    job_id: string;
    analysis_status: string;
    ai_evaluations: unknown;
  };

  const org = await loadOrg(admin, application.org_id);
  const refused = costGate(org);
  if (refused || !org) return refused ?? fail(403, "organization_inactive");

  // The gap probes are built from the extracted CV, so there has to be one.
  // ai_evaluations is one-to-one (unique application_id), which PostgREST
  // embeds as an object; accept an array too rather than depend on it.
  type Evaluation = { extracted: Record<string, unknown> };
  const embedded = application.ai_evaluations as Evaluation | Evaluation[] | null;
  const evaluation = Array.isArray(embedded) ? embedded[0] : embedded;
  if (application.analysis_status !== "done" || !evaluation) {
    return fail(409, "analysis_required");
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
    console.error("interview-gateway: extracted profile does not fit the contract for", application.id);
    return fail(422, "profile_unusable");
  }

  // The job's current core bank: its newest locked version. Every interview
  // for the job is built on it, so candidates face the same structure.
  const { data: banks } = await admin
    .from("interview_job_banks")
    .select(BANK_COLUMNS)
    .eq("job_id", application.job_id)
    .eq("org_id", application.org_id)
    .eq("status", "locked")
    .not("external_bank_id", "is", null)
    .order("version", { ascending: false })
    .limit(1);
  const bank = (banks?.[0] as BankRow | undefined) ?? null;
  if (!bank || !bank.external_bank_id) return fail(409, "bank_required");

  // An earlier create that died before the agent answered would otherwise
  // hold the application's one live interview forever.
  await admin
    .from("interview_assignments")
    .update({ status: "failed", last_error: "agent_unreachable" })
    .eq("application_id", application.id)
    .eq("org_id", application.org_id)
    .eq("status", "draft")
    .is("external_interview_id", null)
    .lt("created_at", staleBefore());

  const { data: inserted, error: insertError } = await admin
    .from("interview_assignments")
    .insert({
      application_id: application.id,
      job_bank_id: bank.id,
      modes: config.data.modes,
      question_count: config.data.question_count,
      duration_minutes: config.data.duration_minutes,
      candidate_result: config.data.candidate_result,
      paste_policy: config.data.paste_policy,
      config: config.data,
      created_by: await callerId(caller),
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    if (insertError?.code === "23505") return fail(409, "interview_exists");
    console.error("interview-gateway: assignment insert failed:", insertError?.code);
    return fail(500, "insert_failed");
  }
  const assignmentId = (inserted as { id: string }).id;

  const request: CreateInterviewRequest = {
    external_ref: assignmentId,
    candidate_ref: await agent.candidateRef(application.id),
    tenant: await tenantContext(agent, org),
    job_bank_id: bank.external_bank_id,
    candidate_profile: profile.data,
    config: config.data,
  };

  // The assignment id doubles as the idempotency key: a retried create can
  // never produce a second interview on the agent.
  const outcome = await callAgent(
    agent,
    InterviewView,
    "POST",
    "/v1/platform/interviews",
    "/interviews",
    request,
    assignmentId
  );
  if (!outcome.ok) {
    // Only while unbound: if the agent's first event already bound its id,
    // the interview exists there (a lost answer, not a refusal) and stays as
    // the event left it.
    await admin
      .from("interview_assignments")
      .update({ status: "failed", last_error: outcome.code })
      .eq("id", assignmentId)
      .eq("org_id", application.org_id)
      .is("external_interview_id", null);
    return fail(outcome.status, outcome.code);
  }

  // The agent's first event may already have landed (apply_interview_event
  // binds the agent's id itself when it wins that race), so this write only
  // moves the status forward: the id is set where still empty, and the status
  // where the row is still the draft placeholder (whose status_at is the
  // platform's clock, so never compared with the agent's) or older than the
  // agent's own clock.
  const view = outcome.data;
  await admin
    .from("interview_assignments")
    .update({ external_interview_id: view.id, last_error: null })
    .eq("id", assignmentId)
    .eq("org_id", application.org_id)
    .is("external_interview_id", null);
  await admin
    .from("interview_assignments")
    .update({ status: view.status, status_at: view.updated_at })
    .eq("id", assignmentId)
    .eq("org_id", application.org_id)
    .eq("status", "draft");
  await admin
    .from("interview_assignments")
    .update({ status: view.status, status_at: view.updated_at })
    .eq("id", assignmentId)
    .eq("org_id", application.org_id)
    .lt("status_at", view.updated_at);

  return json(201, { ok: true, assignment_id: assignmentId, status: view.status });
}

async function handleCancel(
  req: Request,
  admin: SupabaseClient,
  agent: AgentClient,
  assignmentId: string
): Promise<Response> {
  const caller = callerClient(req);
  const assignment = await loadAssignment(admin, assignmentId);
  if (
    !caller ||
    !assignment ||
    !(await callerGate(caller, "can_manage_application", {
      p_application_id: assignment.application_id,
    }))
  ) {
    return fail(404, "not_found");
  }

  if (!assignment.external_interview_id) {
    await admin
      .from("interview_assignments")
      .update({ status: "cancelled", status_at: new Date().toISOString() })
      .eq("id", assignment.id)
      .eq("org_id", assignment.org_id);
    return json(200, { ok: true, status: "cancelled" });
  }

  const outcome = await callAgent(
    agent,
    InterviewView,
    "POST",
    `/v1/platform/interviews/${assignment.external_interview_id}/cancel`,
    "/interviews/:id/cancel"
  );
  if (!outcome.ok) return fail(outcome.status, outcome.code);
  await admin
    .from("interview_assignments")
    .update({ status: outcome.data.status, status_at: outcome.data.updated_at, last_error: null })
    .eq("id", assignment.id)
    .eq("org_id", assignment.org_id);
  return json(200, { ok: true, status: outcome.data.status });
}

// Copies what the agent reports about an interview's questions onto the
// assignment. status_at is left alone: this view carries no timestamp of its
// own, and advancing status_at with the platform's clock could make a later
// webhook look stale and be dropped.
async function syncAssignment(
  admin: SupabaseClient,
  row: AssignmentRow,
  view: InterviewBankView
): Promise<void> {
  const patch: Record<string, string> = {};
  if (view.status !== row.status) patch.status = view.status;
  if (view.plan_hash && view.locked_at && row.bank_locked_at === null) {
    patch.bank_hash = view.plan_hash;
    patch.bank_locked_at = view.locked_at;
  }
  if (Object.keys(patch).length === 0) return;
  patch.updated_at = new Date().toISOString();
  const { error } = await admin
    .from("interview_assignments")
    .update(patch)
    .eq("id", row.id)
    .eq("org_id", row.org_id);
  if (error) console.error("interview-gateway: assignment sync failed for", row.id, error.code);
}

async function handleInterviewBank(
  req: Request,
  admin: SupabaseClient,
  agent: AgentClient,
  payload: Extract<
    Payload,
    { action: "interview_bank_get" | "interview_bank_edit" | "interview_bank_lock" }
  >
): Promise<Response> {
  const caller = callerClient(req);
  const row = await loadAssignment(admin, payload.assignment_id);
  if (!caller || !row) return fail(404, "not_found");

  const allowed =
    payload.action === "interview_bank_get"
      ? await callerCanSee(caller, "interview_assignments", row.id, row.org_id)
      : await callerGate(caller, "can_manage_application", {
          p_application_id: row.application_id,
        });
  if (!allowed) return fail(404, "not_found");

  if (payload.action === "interview_bank_edit" && payload.edit.op === "regenerate") {
    const refused = costGate(await loadOrg(admin, row.org_id));
    if (refused) return refused;
  }

  // The agent never accepted this interview: there are no questions.
  if (!row.external_interview_id) {
    if (payload.action === "interview_bank_get") return interviewReply(row, null);
    return fail(409, "invalid_transition");
  }

  const base = `/v1/platform/interviews/${row.external_interview_id}/bank`;
  const outcome =
    payload.action === "interview_bank_get"
      ? await callAgent(agent, InterviewBankView, "GET", base, "/interviews/:id/bank")
      : payload.action === "interview_bank_edit"
        ? await callAgent(agent, InterviewBankView, "PATCH", base, "/interviews/:id/bank", payload.edit)
        : await callAgent(agent, InterviewBankView, "POST", `${base}/lock`, "/interviews/:id/bank/lock");
  if (!outcome.ok) return fail(outcome.status, outcome.code);

  await syncAssignment(admin, row, outcome.data);
  return interviewReply(row, outcome.data);
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  let payload: Payload;
  try {
    const parsed = Payload.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_request");
    payload = parsed.data;
  } catch {
    return fail(400, "invalid_json");
  }

  const agent = agentClient();
  if (!agent || !agentRefsConfigured()) {
    console.error(
      "interview-gateway: INTERVIEW_AGENT_URL / INTERVIEW_AGENT_KEYS / INTERVIEW_REF_SECRET not set"
    );
    return fail(503, "interviews_not_configured");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  switch (payload.action) {
    case "bank_create":
      return handleBankCreate(req, admin, agent, payload.job_id);
    case "bank_get":
    case "bank_edit":
    case "bank_lock":
    case "bank_retry":
      return handleBankAction(req, admin, agent, payload);
    case "create":
      return handleCreate(req, admin, agent, payload);
    case "cancel":
      return handleCancel(req, admin, agent, payload.assignment_id);
    case "interview_bank_get":
    case "interview_bank_edit":
    case "interview_bank_lock":
      return handleInterviewBank(req, admin, agent, payload);
  }
});
