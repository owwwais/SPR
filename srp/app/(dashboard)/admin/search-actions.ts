"use server";

import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppStatus, JobStatus } from "@/types/database";

export type WorkspaceSearchResult =
  | {
      ok: true;
      applicants: {
        id: string;
        full_name: string;
        ref_code: string;
        status: AppStatus;
        job_title: string;
      }[];
      jobs: { id: string; title: string; status: JobStatus }[];
    }
  | { ok: false };

// The command palette's search (P4g). The organization is the caller's
// active membership, never a value from the client (§10.10); the RPC
// checks membership again and filters by it in SQL, under RLS (0027).
export async function searchWorkspace(query: string): Promise<WorkspaceSearchResult> {
  const session = await requireMembership();
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (q.length < 2) return { ok: true, applicants: [], jobs: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_workspace", {
    p_org: session.org.id,
    p_q: q,
  });
  if (error) {
    // PGRST202 before 0027 is applied: the palette still offers its
    // commands, just no records.
    console.error("search_workspace failed:", error.code, error.message);
    return { ok: false };
  }
  const result = data as { applicants: unknown[]; jobs: unknown[] } | null;
  return {
    ok: true,
    applicants: (result?.applicants ?? []) as Extract<WorkspaceSearchResult, { ok: true }>["applicants"],
    jobs: (result?.jobs ?? []) as Extract<WorkspaceSearchResult, { ok: true }>["jobs"],
  };
}
