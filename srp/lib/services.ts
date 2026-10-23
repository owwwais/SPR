import {
  FileSearch,
  ListChecks,
  Route,
  Scale,
  ScanSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  SERVICE_KINDS,
  SERVICE_OUTPUTS,
  type ServiceKind,
} from "@/lib/validations/services";
import type { AnalysisStatus } from "@/types/database";

// The services hub (D34): catalog and the org-scoped reads its pages share.
// Every query filters by the organization in code; RLS is the second layer
// (the isolation invariant). No model call happens on any of these paths
// (§8): results are read back as the Edge Function stored them.

export const SERVICE_ICONS: Record<ServiceKind, LucideIcon> = {
  job_need: FileSearch,
  pay_grade: Scale,
  team: UsersRound,
  ad_audit: ScanSearch,
  interview_kit: ListChecks,
  onboarding: Route,
};

// Hub order: the analysis first — the others build on a well-defined role.
export const SERVICE_ORDER: readonly ServiceKind[] = SERVICE_KINDS;

// Which services work from an existing job.
export const NEEDS_JOB: Record<ServiceKind, boolean> = {
  job_need: false,
  pay_grade: false,
  team: false,
  ad_audit: true,
  interview_kit: true,
  onboarding: true,
};

export type RunSummary = {
  id: string;
  kind: ServiceKind;
  title: string;
  status: AnalysisStatus;
  error: string | null;
  created_at: string;
};

export async function listRuns(orgId: string, kind?: ServiceKind, limit = 20): Promise<RunSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("service_runs")
    .select("id, kind, title, status, error, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  // Before 0029 the table does not exist: an empty history, not a crash.
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("service runs failed:", error.code, error.message);
    }
    return [];
  }
  return (data ?? []) as RunSummary[];
}

export type Run<K extends ServiceKind = ServiceKind> = RunSummary & {
  job_id: string | null;
  input: Record<string, unknown>;
  model: string | null;
  prompt_version: string | null;
  completed_at: string | null;
  // Parsed against the kind's schema (D5: never display what fails it).
  output: ReturnType<(typeof SERVICE_OUTPUTS)[K]["parse"]> | null;
  // Fields the function added beside the model's output.
  extras: { dropped?: number; computed?: { points: number; grade: number; factor_points: Record<string, number> } };
  invalid: boolean;
};

export async function getRun(orgId: string, runId: string): Promise<Run | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_runs")
    .select("id, kind, title, status, error, created_at, job_id, input, output, model, prompt_version, completed_at")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("service run failed:", error.code, error.message);
    return null;
  }
  if (!data) return null;
  const kind = data.kind as ServiceKind;
  const raw = (data.output ?? null) as Record<string, unknown> | null;
  const parsed = raw ? SERVICE_OUTPUTS[kind].safeParse(raw) : null;
  return {
    ...(data as unknown as RunSummary),
    job_id: data.job_id,
    input: (data.input ?? {}) as Record<string, unknown>,
    model: data.model,
    prompt_version: data.prompt_version,
    completed_at: data.completed_at,
    output: parsed?.success ? (parsed.data as Run["output"]) : null,
    extras: {
      dropped: typeof raw?.dropped === "number" ? raw.dropped : undefined,
      computed: (raw?.computed as Run["extras"]["computed"]) ?? undefined,
    },
    invalid: Boolean(raw && parsed && !parsed.success),
  };
}

export type JobOption = { id: string; title: string; status: string };

export async function listJobOptions(orgId: string): Promise<JobOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("job options failed:", error.code, error.message);
  return (data ?? []) as JobOption[];
}

export type PayGrade = { grade: number; min_monthly: number; max_monthly: number };

/** null when the caller cannot read pay (viewer) or before 0029. */
export async function getPayGrades(orgId: string): Promise<PayGrade[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_grades")
    .select("grade, min_monthly, max_monthly")
    .eq("org_id", orgId)
    .order("grade");
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("pay grades failed:", error.code, error.message);
    }
    return null;
  }
  return (data ?? []) as PayGrade[];
}

export type PoolCandidate = {
  application_id: string;
  full_name: string;
  job_title: string;
  status: string;
  skills: string[];
};

// Team formation's pool: this organization's analysed applicants who are
// still in play. Skills come from the stored extraction — no model call.
export async function candidatePool(orgId: string): Promise<PoolCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, full_name, status, jobs(title), ai_evaluations(extracted)")
    .eq("org_id", orgId)
    .neq("status", "rejected")
    .eq("analysis_status", "done")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("candidate pool failed:", error.code, error.message);
    return [];
  }
  type Row = {
    id: string;
    full_name: string;
    status: string;
    jobs: { title: string } | null;
    ai_evaluations: { extracted: { skills?: unknown } | null } | { extracted: { skills?: unknown } | null }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const evaluation = Array.isArray(row.ai_evaluations) ? row.ai_evaluations[0] : row.ai_evaluations;
    const skills = evaluation?.extracted?.skills;
    return {
      application_id: row.id,
      full_name: row.full_name,
      job_title: row.jobs?.title ?? "",
      status: row.status,
      skills: Array.isArray(skills) ? skills.filter((s): s is string => typeof s === "string") : [],
    };
  });
}
