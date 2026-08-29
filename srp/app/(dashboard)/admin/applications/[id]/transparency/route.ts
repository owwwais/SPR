import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// D24's exportable transparency report.
//
// A downloadable document rather than a screen, because its purpose is to
// leave the product: it answers "why was this candidate rejected?" for
// someone who is not looking at the dashboard — a candidate, a regulator, a
// lawyer. It is served as HTML so it opens and prints anywhere without a PDF
// dependency (D10 allows no new ones).
//
// Authorisation is twofold, as the isolation invariant requires: the route
// gate below, and the RPC's own membership check against current_org_ids().

type Report = {
  generated_at: string;
  application: {
    reference: string;
    applicant_name: string;
    submitted_at: string;
    current_status: string;
    job_title: string;
  };
  advisory_notice: string;
  evaluation: {
    fit_score: number;
    score_breakdown: Record<string, number>;
    justification: {
      strengths?: string[];
      gaps?: string[];
      red_flags?: string[];
    };
    model: string;
    prompt_version: string;
    evaluated_at: string;
  } | null;
  decision_trail: {
    from_status: string | null;
    to_status: string;
    changed_at: string;
    changed_by: string | null;
    decided_by_human: boolean;
    note: string | null;
  }[];
};

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // First of the two gates. The value is unused — what matters is that this
  // throws for a caller without a membership before any data is read.
  await requireMembership();
  const supabase = await createClient();

  // The report is scoped to one application; the RPC re-derives its
  // organization and refuses anything outside the caller's memberships.
  const { data, error } = await supabase.rpc(
    "application_transparency_report",
    { p_application: id }
  );
  if (error) {
    console.error("transparency report failed:", error.message);
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }

  const report = data as Report | null;
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { ar } = await import("@/lib/i18n/ar");
  const t = ar.transparency;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ar-SA") : "—";

  const statusLabel = (s: string | null) =>
    s ? (ar.status[s as keyof typeof ar.status] ?? s) : "—";

  const e = report.evaluation;
  const breakdownRows = e
    ? Object.entries(e.score_breakdown)
        .map(
          ([k, v]) =>
            `<tr><td>${esc(
              ar.evaluation.criteria[k as keyof typeof ar.evaluation.criteria] ??
                k
            )}</td><td class="n">${esc(v)}</td></tr>`
        )
        .join("")
    : "";

  const list = (heading: string, items?: string[]) =>
    items && items.length > 0
      ? `<h3>${esc(heading)}</h3><ul>${items
          .map((i) => `<li>${esc(i)}</li>`)
          .join("")}</ul>`
      : "";

  const trailRows = report.decision_trail
    .map(
      (h) => `<tr>
        <td>${esc(fmt(h.changed_at))}</td>
        <td>${esc(statusLabel(h.from_status))} ← ${esc(statusLabel(h.to_status))}</td>
        <td>${esc(h.changed_by ?? t.system)}</td>
        <td>${h.decided_by_human ? esc(t.humanDecision) : "—"}</td>
        <td>${esc(h.note ?? "—")}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${esc(t.title)} — ${esc(report.application.reference)}</title>
<style>
  body{font-family:'IBM Plex Sans Arabic',-apple-system,'Segoe UI',Tahoma,sans-serif;
       max-width:820px;margin:0 auto;padding:40px 24px;color:#1c1c1c;line-height:1.8}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 8px;
     border-bottom:1px solid #e5e5e5;padding-bottom:6px} h3{font-size:14px;margin:16px 0 6px}
  .notice{background:#f5f5f5;border-inline-start:4px solid #1c1c1c;padding:12px 16px;
          margin:20px 0;font-size:14px}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}
  th,td{text-align:start;padding:8px;border-bottom:1px solid #eee;vertical-align:top}
  th{font-weight:600;background:#fafafa}
  .n{font-variant-numeric:tabular-nums}
  .score{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}
  ul{margin:4px 0;padding-inline-start:20px} li{margin:3px 0}
  .meta{color:#666;font-size:13px}
  @media print{body{padding:0}}
</style></head><body>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.generatedAt)}: ${esc(fmt(report.generated_at))}</p>

<div class="notice">${esc(report.advisory_notice)}</div>

<h2>${esc(t.applicant)}</h2>
<table>
  <tr><th>${esc(t.reference)}</th><td>${esc(report.application.reference)}</td></tr>
  <tr><th>${esc(t.applicant)}</th><td>${esc(report.application.applicant_name)}</td></tr>
  <tr><th>${esc(t.job)}</th><td>${esc(report.application.job_title)}</td></tr>
  <tr><th>${esc(t.submittedAt)}</th><td>${esc(fmt(report.application.submitted_at))}</td></tr>
  <tr><th>${esc(t.currentStatus)}</th><td>${esc(statusLabel(report.application.current_status))}</td></tr>
</table>

<h2>${esc(t.evaluation)}</h2>
${
  e
    ? `<p class="score">${esc(e.fit_score)} / 100</p>
       <h3>${esc(t.breakdown)}</h3>
       <table><tbody>${breakdownRows}</tbody></table>
       <h3>${esc(t.justification)}</h3>
       ${list(t.strengths, e.justification?.strengths)}
       ${list(t.gaps, e.justification?.gaps)}
       ${list(t.redFlags, e.justification?.red_flags)}
       <table>
         <tr><th>${esc(t.model)}</th><td>${esc(e.model)}</td></tr>
         <tr><th>${esc(t.promptVersion)}</th><td>${esc(e.prompt_version)}</td></tr>
         <tr><th>${esc(t.evaluatedAt)}</th><td>${esc(fmt(e.evaluated_at))}</td></tr>
       </table>`
    : `<p>${esc(t.noEvaluation)}</p>`
}

<h2>${esc(t.trail)}</h2>
<table>
  <thead><tr>
    <th>${esc(t.evaluatedAt)}</th><th>${esc(t.currentStatus)}</th>
    <th>${esc(t.changedBy)}</th><th>${esc(t.humanDecision)}</th><th>${esc(t.note)}</th>
  </tr></thead>
  <tbody>${trailRows}</tbody>
</table>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="transparency-${report.application.reference}.html"`,
      // Personal data: never cached by a proxy on the way out.
      "Cache-Control": "no-store, private",
    },
  });
}
