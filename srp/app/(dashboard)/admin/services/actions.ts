"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAdminister, canWrite, requireMembership } from "@/lib/auth";
import { ar } from "@/lib/i18n/ar";
import { getRun } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import {
  GRADE_COUNT,
  SERVICE_INPUTS,
  isServiceKind,
  type JobNeedOutput,
} from "@/lib/validations/services";

export type ServiceFormState = { error: string | null };

const ERRORS = ar.services.errors as Record<string, string>;

async function functionErrorCode(error: unknown): Promise<string> {
  try {
    const context = (error as { context?: Response }).context;
    if (context) return ((await context.json()) as { error?: string }).error ?? "";
  } catch {
    // An unreadable body is just an unknown error.
  }
  return "";
}

const str = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const optional = (value: string) => (value === "" ? undefined : value);

// The form's fields, shaped as the kind's input contract. Validated here for
// an early, friendly error and again inside hr-services (the authority).
function inputFor(kind: string, formData: FormData): Record<string, unknown> {
  switch (kind) {
    case "job_need":
      return {
        job_id: optional(str(formData, "job_id")),
        title_hint: str(formData, "title_hint"),
        problem: str(formData, "problem"),
        outcomes: str(formData, "outcomes"),
        team_context: str(formData, "team_context"),
        location: str(formData, "location"),
        work_mode: optional(str(formData, "work_mode")),
        employment_type: optional(str(formData, "employment_type")),
        level: optional(str(formData, "level")),
        tools: str(formData, "tools"),
        existing_description: str(formData, "existing_description"),
      };
    case "pay_grade":
      return str(formData, "source") === "text"
        ? { title: str(formData, "title"), summary: str(formData, "summary") }
        : { job_id: str(formData, "job_id") };
    case "team": {
      const size = Number(str(formData, "team_size"));
      return {
        goal: str(formData, "goal"),
        timeline: str(formData, "timeline"),
        team_size: Number.isInteger(size) && size > 0 ? size : undefined,
      };
    }
    case "onboarding":
      return { job_id: str(formData, "job_id"), context: str(formData, "context") };
    default:
      return { job_id: str(formData, "job_id") };
  }
}

export async function runService(
  kind: string,
  _prev: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const session = await requireMembership();
  if (!canWrite(session.role)) return { error: ERRORS.forbidden };
  if (!isServiceKind(kind)) return { error: ERRORS.invalid_input };

  const input = inputFor(kind, formData);
  if (!SERVICE_INPUTS[kind].safeParse(input).success) return { error: ERRORS.invalid_input };

  let runId: string | null = null;
  try {
    const supabase = await createClient();
    // The staff member's own JWT: hr-services checks their membership in
    // this organization itself (§10.10), so org_id here is a claim it
    // verifies, not one it trusts.
    const { data, error } = await supabase.functions.invoke("hr-services", {
      body: { kind, org_id: session.org.id, input },
    });
    if (error) {
      const code = await functionErrorCode(error);
      console.error("hr-services failed:", code || error.message);
      return { error: ERRORS[code] ?? (code ? ERRORS.server_error : ERRORS.unreachable) };
    }
    runId = typeof data?.run_id === "string" ? data.run_id : null;
  } catch (err) {
    console.error("hr-services unreachable:", err instanceof Error ? err.message : err);
    return { error: ERRORS.unreachable };
  }
  if (!runId) return { error: ERRORS.server_error };

  revalidatePath("/admin/services");
  redirect(`/admin/services/${kind}/${runId}`);
}

export type PayGradesState = { saved: boolean; error: string | null };

// The company's salary structure: one row per grade that has both values,
// no row for a grade left empty. Owner/admin only, here and in RLS.
export async function savePayGrades(_prev: PayGradesState, formData: FormData): Promise<PayGradesState> {
  const session = await requireMembership();
  const t = ar.services.results.payGrade;
  if (!canAdminister(session.role)) return { saved: false, error: t.structureReadOnly };

  const rows: { grade: number; min_monthly: number; max_monthly: number }[] = [];
  const empty: number[] = [];
  for (let grade = 1; grade <= GRADE_COUNT; grade++) {
    const min = str(formData, `min_${grade}`).replace(/[,٬\s]/g, "");
    const max = str(formData, `max_${grade}`).replace(/[,٬\s]/g, "");
    if (min === "" && max === "") {
      empty.push(grade);
      continue;
    }
    const minN = Number(min);
    const maxN = Number(max);
    if (!Number.isInteger(minN) || !Number.isInteger(maxN) || minN <= 0 || maxN < minN || maxN > 10_000_000) {
      return { saved: false, error: t.saveFailed };
    }
    rows.push({ grade, min_monthly: minN, max_monthly: maxN });
  }

  const supabase = await createClient();
  if (rows.length > 0) {
    const { error } = await supabase.from("pay_grades").upsert(
      rows.map((row) => ({
        ...row,
        org_id: session.org.id,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "org_id,grade" }
    );
    if (error) {
      console.error("savePayGrades failed:", error.code, error.message);
      return { saved: false, error: t.saveFailed };
    }
  }
  if (empty.length > 0) {
    const { error } = await supabase
      .from("pay_grades")
      .delete()
      .eq("org_id", session.org.id)
      .in("grade", empty);
    if (error) {
      console.error("savePayGrades (clear) failed:", error.code, error.message);
      return { saved: false, error: t.saveFailed };
    }
  }

  revalidatePath("/admin/services", "layout");
  return { saved: true, error: null };
}

export type CreateJobState = { error: string | null };

const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

// Job-needs analysis → a DRAFT job. Nothing is published: the company edits
// every field and publishing still passes FR-01's gate.
export async function createJobFromNeed(runId: string): Promise<CreateJobState> {
  const session = await requireMembership();
  const t = ar.services.results.jobNeed;
  if (!canWrite(session.role)) return { error: ERRORS.forbidden };

  const run = await getRun(session.org.id, runId);
  if (!run || run.kind !== "job_need" || run.status !== "done" || !run.output) {
    return { error: t.createFailed };
  }
  const out = run.output as JobNeedOutput;
  const input = run.input as { location?: string; employment_type?: string };

  const requirements = [
    `## ${t.requirementsHeading}`,
    list(out.must_have.map((m) => m.requirement)),
    out.nice_to_have.length ? `\n## ${t.niceHeading}\n${list(out.nice_to_have.map((m) => m.requirement))}` : "",
    out.competencies.length ? `\n## ${t.competenciesHeading}\n${list(out.competencies.map((c) => `${c.name}: ${c.definition}`))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const description = [out.role_summary, `\n## ${t.outcomesHeading}`, list(out.first_90_days)].join("\n");
  const type = ["full_time", "part_time", "contract", "remote", "internship"].includes(input.employment_type ?? "")
    ? (input.employment_type as "full_time")
    : "full_time";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      org_id: session.org.id,
      created_by: session.userId,
      title: out.title_suggestions[0]!.slice(0, 200),
      location: input.location?.slice(0, 120) || null,
      type,
      description: description.slice(0, 20000),
      requirements: requirements.slice(0, 20000),
      skills: out.skills.slice(0, 20),
      min_years_experience: out.min_years_experience,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createJobFromNeed failed:", error?.code, error?.message);
    return { error: t.createFailed };
  }

  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs/${data.id}/edit`);
}
