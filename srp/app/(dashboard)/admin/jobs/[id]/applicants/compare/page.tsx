import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BREAKDOWN_MAX, ScoreBreakdown } from "@/lib/validations/evaluation";
import { ar } from "@/lib/i18n/ar";

// Advanced feature #5: "why is this candidate ranked above that one?" — the
// question a hiring manager actually asks, side by side rather than two
// separate tabs. Read-only: it changes nothing about status or ranking.

export const metadata: Metadata = {
  title: ar.applicants.compare.title,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Justification = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  red_flags: z.array(z.string()),
});

type Candidate = {
  id: string;
  full_name: string;
  fit_score: number;
  score_breakdown: z.infer<typeof ScoreBreakdown>;
  justification: z.infer<typeof Justification>;
};

export default async function CompareApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const session = await requireMembership();
  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();

  const backHref = `/admin/jobs/${jobId}/applicants`;
  const t = ar.applicants.compare;

  const raw = (await searchParams).id;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v) =>
    UUID_RE.test(v)
  );

  if (ids.length !== 2) {
    return <NeedsSelection backHref={backHref} message={t.needExactlyTwo} />;
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, full_name, fit_score, ai_evaluations(score_breakdown, justification)"
    )
    .eq("org_id", session.org.id)
    .eq("job_id", jobId)
    .in("id", ids);

  const candidates: Candidate[] = [];
  for (const candidateId of ids) {
    const row = rows?.find((r) => r.id === candidateId);
    const evaluation = row?.ai_evaluations as unknown as
      | { score_breakdown: unknown; justification: unknown }
      | { score_breakdown: unknown; justification: unknown }[]
      | null;
    const evalRow = Array.isArray(evaluation) ? evaluation[0] : evaluation;
    if (!row || row.fit_score === null || !evalRow) continue;

    const breakdown = ScoreBreakdown.safeParse(evalRow.score_breakdown);
    const justification = Justification.safeParse(evalRow.justification);
    if (!breakdown.success || !justification.success) continue;

    candidates.push({
      id: row.id,
      full_name: row.full_name,
      fit_score: row.fit_score,
      score_breakdown: breakdown.data,
      justification: justification.data,
    });
  }

  if (candidates.length !== 2) {
    return <NeedsSelection backHref={backHref} message={t.missingEvaluation} />;
  }

  const [a, b] = candidates as [Candidate, Candidate];
  const criteria = Object.keys(BREAKDOWN_MAX) as (keyof typeof BREAKDOWN_MAX)[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {t.backToApplicants}
        </Link>
        <h1 className="text-2xl font-bold">{t.title}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[a, b].map((c) => (
          <div key={c.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{c.full_name}</span>
              <ScoreBadge score={c.fit_score} className="text-lg" />
            </div>
            <span className="text-xs text-muted-foreground">
              {t.overallScore}
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-start font-medium">
                {ar.evaluation.scoreBreakdown}
              </th>
              <th className="p-3 text-start font-medium">{a.full_name}</th>
              <th className="p-3 text-start font-medium">{b.full_name}</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => {
              const va = a.score_breakdown[criterion];
              const vb = b.score_breakdown[criterion];
              const max = BREAKDOWN_MAX[criterion];
              return (
                <tr key={criterion} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">
                    {ar.evaluation.criteria[criterion]}
                    <span className="ms-1 text-xs">/ {max}</span>
                  </td>
                  <td
                    className={`p-3 tabular-nums ${va > vb ? "font-bold text-success" : ""}`}
                  >
                    {va}
                    {va > vb && (
                      <Badge variant="outline" className="ms-2 text-[10px]">
                        {t.higher}
                      </Badge>
                    )}
                  </td>
                  <td
                    className={`p-3 tabular-nums ${vb > va ? "font-bold text-success" : ""}`}
                  >
                    {vb}
                    {vb > va && (
                      <Badge variant="outline" className="ms-2 text-[10px]">
                        {t.higher}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[a, b].map((c) => (
          <div key={c.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <span className="font-semibold">{c.full_name}</span>
            <JustificationList title={ar.evaluation.strengths} items={c.justification.strengths} />
            <JustificationList title={ar.evaluation.gaps} items={c.justification.gaps} />
            <JustificationList title={ar.evaluation.redFlags} items={c.justification.red_flags} />
          </div>
        ))}
      </div>
    </div>
  );
}

function JustificationList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
        {title}
      </h3>
      <ul className="list-inside list-disc text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function NeedsSelection({
  backHref,
  message,
}: {
  backHref: string;
  message: string;
}) {
  const t = ar.applicants.compare;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        {message}
      </div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" aria-hidden />
        {t.backToApplicants}
      </Link>
    </div>
  );
}
