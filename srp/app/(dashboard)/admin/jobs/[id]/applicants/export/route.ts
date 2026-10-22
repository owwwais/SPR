import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";

// Advanced feature #9: a CSV of every applicant for one job. The one
// feature COMPETITIVE-2026-08.md flagged as "every customer's first ask,
// and its absence reads as an unfinished product" — and the cheapest to
// build, since nothing here is new data.
//
// Exports the whole job, ignoring the ranked list's pagination/status
// filter: a spreadsheet that silently dropped rows because a filter chip
// happened to be selected would be the exact "truncated and presented as
// fact" mistake PERF-2026-08.md already found once in org_stats (0013).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CSV-safe: quote every field, double internal quotes, and — since this
// opens directly in Excel/Sheets — neutralize formula injection by prefixing
// a leading =, +, -, @ or tab with an apostrophe before quoting. All of the
// text here is applicant-supplied (full_name, cover-note-adjacent fields are
// not included, but full_name and email are), so it is never trusted as-is.
function csvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",") + "\r\n";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await requireMembership();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: applicants, error } = await supabase
    .from("applications")
    .select(
      "ref_code, full_name, email, phone, status, fit_score, analysis_status, source, created_at"
    )
    .eq("org_id", session.org.id)
    .eq("job_id", id)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("applicants CSV export query failed:", error.message);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const t = ar.applicants.export;
  let csv =
    "﻿" + // BOM: Excel on Windows otherwise mis-decodes the Arabic headers
    csvRow([
      t.columns.refCode,
      t.columns.name,
      t.columns.email,
      t.columns.phone,
      t.columns.status,
      t.columns.score,
      t.columns.analysis,
      t.columns.source,
      t.columns.appliedAt,
    ]);

  for (const a of applicants ?? []) {
    csv += csvRow([
      a.ref_code,
      a.full_name,
      a.email,
      a.phone,
      ar.status[a.status],
      a.fit_score ?? "",
      t.analysisStatus[a.analysis_status] ?? a.analysis_status,
      a.source ?? "",
      new Date(a.created_at).toLocaleString("ar-SA"),
    ]);
  }

  const filename = `applicants-${job.title.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
