import Link from "next/link";
import { AlertTriangle, Pencil, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bullets, ConfidenceNote, Panel } from "@/components/services/parts";
import { CopyButton, CreateJobButton, PayPlacement, PayStructureForm } from "@/components/services/client";
import { ar } from "@/lib/i18n/ar";
import type { PayGrade, PoolCandidate, Run } from "@/lib/services";
import {
  FACTOR_WEIGHTS,
  PAY_FACTORS,
  gradeBands,
  matchedSkills,
  normalizeSkill,
  type AdAuditOutput,
  type InterviewKitOutput,
  type JobNeedOutput,
  type OnboardingOutput,
  type PayGradeOutput,
  type TeamOutput,
} from "@/lib/validations/services";

const r = ar.services.results;

// ============================================================
// Job-needs analysis
// ============================================================

export function JobNeedResult({ run, canWrite }: { run: Run; canWrite: boolean }) {
  const out = run.output as JobNeedOutput;
  const t = r.jobNeed;
  const basisBadge = (basis: "stated" | "typical") => (
    <Badge variant={basis === "stated" ? "default" : "secondary"}>{basis === "stated" ? t.stated : t.typical}</Badge>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel id="summary" title={t.summary}>
          <p className="text-sm leading-relaxed text-body">{out.role_summary}</p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t.titles}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {out.title_suggestions.map((title) => (
                <Badge key={title} variant="outline">
                  {title}
                </Badge>
              ))}
            </dd>
            <dt className="text-muted-foreground">{t.seniority}</dt>
            <dd className="font-medium">{ar.services.kinds.job_need.fields.levels[out.seniority]}</dd>
            <dt className="text-muted-foreground">{t.years}</dt>
            <dd>
              <span className="font-medium tabular-nums">
                {out.min_years_experience} {t.yearsUnit}
              </span>
              <span className="text-muted-foreground"> — {out.years_rationale}</span>
            </dd>
          </dl>
        </Panel>

        <Panel id="tasks" title={t.tasks}>
          <ul className="flex flex-col divide-y">
            {out.key_tasks.map((task, index) => (
              <li key={index} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 text-body">{task.task}</span>
                <span className="flex shrink-0 gap-1.5">
                  <Badge variant={task.importance === "core" ? "success" : "secondary"}>
                    {task.importance === "core" ? t.core : t.supporting}
                  </Badge>
                  {basisBadge(task.basis)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel id="must" title={t.mustHave}>
          <ol className="flex flex-col gap-4">
            {out.must_have.map((item, index) => (
              <li key={index} className="flex flex-col gap-1.5 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-medium">{item.requirement}</span>
                  <span className="flex shrink-0 gap-1.5">
                    <Badge variant="outline">{t.kinds[item.kind]}</Badge>
                    {basisBadge(item.basis)}
                  </span>
                </div>
                <p className="text-sm text-body">
                  <span className="text-muted-foreground">{t.why}: </span>
                  {item.why}
                </p>
                <p className="text-sm text-body">
                  <span className="text-muted-foreground">{t.evidence}: </span>
                  {item.evidence_in_cv}
                </p>
              </li>
            ))}
          </ol>
        </Panel>

        {out.nice_to_have.length > 0 && (
          <Panel id="nice" title={t.niceToHave}>
            <ul className="flex flex-col gap-2 text-sm">
              {out.nice_to_have.map((item, index) => (
                <li key={index}>
                  <span className="font-medium">{item.requirement}</span>
                  <span className="text-muted-foreground"> — {item.why}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel id="competencies" title={t.competencies}>
          <div className="grid gap-4 sm:grid-cols-2">
            {out.competencies.map((c, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-lg border p-4">
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground">{c.definition}</span>
                <Bullets items={c.indicators} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel id="first90" title={t.first90}>
            <Bullets items={out.first_90_days} />
          </Panel>
          <Panel id="focus" title={t.interviewFocus}>
            <Bullets items={out.interview_focus} />
          </Panel>
        </div>

        {out.screening_questions.length > 0 && (
          <Panel id="screening" title={t.screening}>
            <Bullets items={out.screening_questions} />
          </Panel>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Panel id="confidence" title={ar.services.advisory}>
          <ConfidenceNote level={out.confidence} />
          {canWrite && <CreateJobButton runId={run.id} />}
        </Panel>
        <Panel id="skills" title={t.skills}>
          <div className="flex flex-wrap gap-1.5">
            {out.skills.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              out.skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  <bdi>{skill}</bdi>
                </Badge>
              ))
            )}
          </div>
        </Panel>
        {out.clarity_warnings.length > 0 && (
          <Panel id="clarity" title={t.clarity}>
            <ul className="flex flex-col gap-3 text-sm">
              {out.clarity_warnings.map((w, index) => (
                <li key={index} className="flex flex-col gap-1">
                  <Badge variant="warning">{t.clarityKinds[w.kind]}</Badge>
                  <span className="text-body">{w.message}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {out.fairness_flags.length > 0 && (
          <Panel id="fairness" title={t.fairness}>
            <Bullets items={out.fairness_flags} />
          </Panel>
        )}
        <p className="rounded-lg border bg-surface-soft px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t.saudization}
        </p>
        <p className="rounded-lg border bg-surface-soft px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t.salary}
        </p>
      </aside>
    </div>
  );
}

// ============================================================
// Fair pay: point-factor evaluation + the company's own range
// ============================================================

export function PayGradeResult({
  run,
  grades,
  canEdit,
}: {
  run: Run;
  grades: PayGrade[] | null;
  canEdit: boolean;
}) {
  const out = run.output as PayGradeOutput;
  const computed = run.extras.computed;
  const t = r.payGrade;
  const byFactor = new Map(out.factors.map((f) => [f.factor, f]));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel id="grade" title={t.grade}>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums text-primary">{computed?.grade ?? "—"}</span>
              <span className="text-sm text-muted-foreground">/ 12</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t.points}</span>
              <span className="text-lg font-semibold tabular-nums">
                {computed?.points ?? "—"} <span className="text-sm font-normal text-muted-foreground">{t.ofPoints}</span>
              </span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-body">{out.role_summary}</p>
          <ConfidenceNote level={out.confidence} />
        </Panel>

        <Panel id="factors" title={t.factors}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">{t.factor}</th>
                  <th className="py-2 text-start font-medium">{t.level}</th>
                  <th className="py-2 text-start font-medium">{t.points}</th>
                  <th className="py-2 text-start font-medium">{ar.services.results.jobNeed.why}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PAY_FACTORS.map((factor) => {
                  const f = byFactor.get(factor);
                  return (
                    <tr key={factor} className="align-top">
                      <td className="py-2.5 pe-3 font-medium whitespace-nowrap">{t.factorNames[factor]}</td>
                      <td className="py-2.5 pe-3 tabular-nums whitespace-nowrap">{f?.level ?? "—"} / 6</td>
                      <td className="py-2.5 pe-3 tabular-nums whitespace-nowrap">
                        {computed?.factor_points?.[factor] ?? "—"}
                        <span className="text-muted-foreground"> / {FACTOR_WEIGHTS[factor]}</span>
                      </td>
                      <td className="py-2.5 text-body">{f?.rationale}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel id="levels" title={t.placement}>
          <dl className="flex flex-col gap-3 text-sm">
            {(["entry", "competent", "expert"] as const).map((level) => (
              <div key={level} className="flex flex-col gap-0.5">
                <dt className="font-medium">{t[level]}</dt>
                <dd className="text-body">{out.level_guidance[level]}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel id="how" title={t.howTitle}>
          <p className="text-sm leading-relaxed text-body">{t.howBody}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <table className="text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 text-start font-medium">{t.factor}</th>
                  <th className="py-1.5 text-start font-medium">{t.weight}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PAY_FACTORS.map((factor) => (
                  <tr key={factor}>
                    <td className="py-1.5 pe-3">{t.factorNames[factor]}</td>
                    <td className="py-1.5 tabular-nums">{FACTOR_WEIGHTS[factor]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 text-start font-medium">{t.grade}</th>
                  <th className="py-1.5 text-start font-medium">{t.points}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gradeBands().map((band) => (
                  <tr key={band.grade} className={band.grade === computed?.grade ? "bg-primary-soft" : undefined}>
                    <td className="py-1 pe-3 tabular-nums">{band.grade}</td>
                    <td className="py-1 tabular-nums">
                      <bdi>
                        {band.from}–{band.to}
                      </bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel id="range" title={t.rangeTitle}>
          {grades === null ? (
            <p className="text-sm text-muted-foreground">{ar.services.errors.forbidden}</p>
          ) : (
            <PayPlacement suggested={computed?.grade ?? 1} grades={grades} />
          )}
        </Panel>
        <Panel id="fair" title={t.fairPay}>
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-body">
            {t.fairPayItems.map((item) => (
              <li key={item} className="flex gap-2">
                <Scale className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
        {grades !== null && (
          <Panel id="structure" title={t.structureTitle}>
            <p className="text-xs leading-relaxed text-muted-foreground">{t.structureHint}</p>
            <PayStructureForm grades={grades} canEdit={canEdit} />
          </Panel>
        )}
      </aside>
    </div>
  );
}

// ============================================================
// Team formation (matching computed here, no model call — §8, D28)
// ============================================================

export function TeamResult({ run, pool }: { run: Run; pool: PoolCandidate[] }) {
  const out = run.output as TeamOutput;
  const t = r.team;
  const allSkills = [...new Map(out.roles.flatMap((role) => role.skills).map((s) => [normalizeSkill(s), s])).values()];
  const poolSkills = new Set(pool.flatMap((c) => c.skills.map(normalizeSkill)));

  return (
    <div className="flex flex-col gap-6">
      <Panel id="summary" title={t.summary}>
        <p className="text-sm leading-relaxed text-body">{out.team_summary}</p>
        <ConfidenceNote level={out.confidence} />
      </Panel>

      <Panel id="roles" title={t.roles}>
        <p className="text-xs text-muted-foreground">{t.matchesHint}</p>
        <div className="flex flex-col gap-4">
          {out.roles.map((role, index) => {
            const matches = pool
              .map((c) => ({ c, skills: matchedSkills(role.skills, c.skills) }))
              .filter((m) => m.skills.length > 0)
              .sort((a, b) => b.skills.length - a.skills.length)
              .slice(0, 3);
            const gapLink = `/admin/services/job_need?${new URLSearchParams({
              title_hint: role.title,
              problem: role.why,
              tools: role.skills.join("، "),
              level: role.seniority,
            }).toString()}`;
            return (
              <article key={index} className="flex flex-col gap-3 rounded-lg border p-4 break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{role.title}</h3>
                  <span className="flex gap-1.5">
                    <Badge variant="outline">
                      {t.count}: {role.count}
                    </Badge>
                    <Badge variant="secondary">{ar.services.kinds.job_need.fields.levels[role.seniority]}</Badge>
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{role.why}</p>
                <Bullets items={role.responsibilities} />
                <div className="flex flex-wrap gap-1.5">
                  {role.skills.map((skill) => (
                    <Badge key={skill} variant={poolSkills.has(normalizeSkill(skill)) ? "success" : "secondary"}>
                      <bdi>{skill}</bdi>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-col gap-2 border-t pt-3">
                  <span className="text-xs font-medium text-muted-foreground">{t.matchesTitle}</span>
                  {matches.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{t.noMatches}</span>
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={gapLink} />} className="print:hidden">
                        {t.analyseGap}
                      </Button>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {matches.map(({ c, skills }) => (
                        <li key={c.application_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <Link href={`/admin/applications/${c.application_id}`} className="font-medium text-primary hover:underline">
                            {c.full_name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            <bdi className="tabular-nums">
                              {skills.length} {t.matched} {role.skills.length}
                            </bdi>{" "}
                            · <bdi>{skills.join("، ")}</bdi>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel id="coverage" title={t.coverage}>
          <ul className="flex flex-wrap gap-1.5">
            {allSkills.map((skill) => {
              const covered = poolSkills.has(normalizeSkill(skill));
              return (
                <li key={skill}>
                  <Badge variant={covered ? "success" : "warning"}>
                    <bdi>{skill}</bdi> · {covered ? t.covered : t.uncovered}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel id="collab" title={t.collaboration}>
          <Bullets items={out.collaboration} />
        </Panel>
      </div>
      {out.risks.length > 0 && (
        <Panel id="risks" title={t.risks}>
          <Bullets items={out.risks} />
        </Panel>
      )}
    </div>
  );
}

// ============================================================
// Job-ad audit
// ============================================================

const SEVERITY_VARIANT = { high: "destructive", medium: "warning", low: "secondary" } as const;

export function AdAuditResult({ run }: { run: Run }) {
  const out = run.output as AdAuditOutput;
  const t = r.adAudit;
  const order = { high: 0, medium: 1, low: 2 };
  const findings = [...out.findings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel id="overall" title={t.overall}>
          <p className="text-sm leading-relaxed text-body">{out.overall}</p>
          <ConfidenceNote level={out.confidence} />
        </Panel>
        <Panel id="findings" title={t.findings}>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noFindings}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {findings.map((f, index) => (
                <li key={index} className="flex flex-col gap-2 rounded-lg border p-4 break-inside-avoid">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={SEVERITY_VARIANT[f.severity]}>{t.severity[f.severity]}</Badge>
                    <Badge variant="outline">{t.categories[f.category]}</Badge>
                  </div>
                  {f.quote && (
                    <blockquote className="border-s-2 border-warning ps-3 text-sm text-body">«{f.quote}»</blockquote>
                  )}
                  <p className="text-sm text-body">
                    <span className="text-muted-foreground">{t.issue}: </span>
                    {f.issue}
                  </p>
                  <p className="text-sm text-body">
                    <span className="text-muted-foreground">{t.suggestion}: </span>
                    {f.suggestion}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel id="rewrite" title={t.rewritten} actions={<CopyButton text={out.rewritten_requirements} />}>
          <p className="text-sm leading-relaxed whitespace-pre-line text-body">{out.rewritten_requirements}</p>
        </Panel>
      </div>
      <aside className="flex flex-col gap-4">
        {run.job_id && (
          <Button variant="outline" nativeButton={false} render={<Link href={`/admin/jobs/${run.job_id}/edit`} />} className="print:hidden">
            <Pencil className="size-4" aria-hidden />
            {t.editJob}
          </Button>
        )}
        {out.missing.length > 0 && (
          <Panel id="missing" title={t.missing}>
            <ul className="flex flex-col gap-2 text-sm">
              {out.missing.map((item) => (
                <li key={item} className="flex gap-2 text-body">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {out.strengths.length > 0 && (
          <Panel id="strengths" title={t.strengths}>
            <Bullets items={out.strengths} />
          </Panel>
        )}
      </aside>
    </div>
  );
}

// ============================================================
// Structured interview guide
// ============================================================

export function InterviewKitResult({ run }: { run: Run }) {
  const out = run.output as InterviewKitOutput;
  const t = r.interviewKit;
  return (
    <div className="flex flex-col gap-6">
      <Panel id="summary" title={t.summary}>
        <p className="text-sm leading-relaxed text-body">{out.summary}</p>
      </Panel>
      {out.competencies.map((c, index) => (
        <Panel key={index} id={`competency-${index}`} title={`${t.competency}: ${c.name}`}>
          <p className="text-sm text-muted-foreground">
            {t.why}: {c.why}
          </p>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t.questions}</h3>
            <ol className="flex list-decimal flex-col gap-3 ps-5 text-sm">
              {c.questions.map((q, qi) => (
                <li key={qi} className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-body">{q.question}</span>
                    <Badge variant="secondary">{t.kinds[q.kind]}</Badge>
                  </span>
                  {q.follow_ups.length > 0 && (
                    <span className="text-muted-foreground">
                      {t.followUps}: {q.follow_ups.join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t.scale}</h3>
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
              {c.anchors.map((anchor, ai) => (
                <div key={ai} className="flex flex-col gap-1 bg-card p-3">
                  <dt className="text-xs font-semibold text-primary">{t.levels[ai]}</dt>
                  <dd className="text-sm text-body">{anchor}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      ))}
      <div className="grid gap-6 md:grid-cols-2">
        {out.probes.length > 0 && (
          <Panel id="probes" title={t.probes}>
            <Bullets items={out.probes} />
          </Panel>
        )}
        {out.interviewer_tips.length > 0 && (
          <Panel id="tips" title={t.tips}>
            <Bullets items={out.interviewer_tips} />
          </Panel>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 30/60/90 onboarding
// ============================================================

export function OnboardingResult({ run }: { run: Run }) {
  const out = run.output as OnboardingOutput;
  const t = r.onboarding;
  return (
    <div className="flex flex-col gap-6">
      <Panel id="summary" title={t.summary}>
        <p className="text-sm leading-relaxed text-body">{out.summary}</p>
      </Panel>
      <Panel id="week" title={t.firstWeek}>
        <Bullets items={out.first_week} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-3">
        {out.phases.map((phase) => (
          <Panel key={phase.phase} id={phase.phase} title={t.phases[phase.phase]}>
            <p className="text-sm">
              <span className="text-muted-foreground">{t.goal}: </span>
              <span className="font-medium">{phase.goal}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground">{t.activities}</h3>
              <Bullets items={phase.activities} />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground">{t.measures}</h3>
              <Bullets items={phase.success_measures} />
            </div>
            {phase.support.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">{t.support}</h3>
                <Bullets items={phase.support} />
              </div>
            )}
          </Panel>
        ))}
      </div>
      <Panel id="checkins" title={t.checkins}>
        <Bullets items={out.checkins} />
      </Panel>
    </div>
  );
}
