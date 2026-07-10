import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarClock, MessageCircleQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ar } from "@/lib/i18n/ar";
import { formatDate, formatDateTime } from "@/lib/format";
import { InterviewQa } from "@/lib/validations/screening";

export const metadata: Metadata = {
  title: ar.calendar.title,
};

type InterviewRow = {
  id: string;
  full_name: string;
  status: string;
  interview_at: string | null;
  interview_qa: unknown;
  jobs: { title: string } | null;
  ai_evaluations: {
    fit_score: number;
    interview_questions: unknown;
  } | null;
};

function InterviewCard({ row }: { row: InterviewRow }) {
  const qa = InterviewQa.safeParse(row.interview_qa);
  const answered = qa.success
    ? qa.data.filter((e) => e.answer.trim().length > 0).length
    : 0;
  const suggested = Array.isArray(row.ai_evaluations?.interview_questions)
    ? row.ai_evaluations.interview_questions.length
    : 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{row.full_name}</span>
            {row.ai_evaluations && (
              <ScoreBadge score={row.ai_evaluations.fit_score} />
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {row.jobs?.title}
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {row.interview_at && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden />
                {formatDateTime(row.interview_at)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageCircleQuestion className="size-3.5" aria-hidden />
              {suggested} {ar.calendar.questionsCount} — {answered}{" "}
              {ar.calendar.answersCount}
            </span>
          </div>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/admin/applications/${row.id}#interview`} />}
        >
          {ar.calendar.manage}
        </Button>
      </CardContent>
    </Card>
  );
}

function groupByDay(rows: InterviewRow[]): Map<string, InterviewRow[]> {
  const groups = new Map<string, InterviewRow[]>();
  for (const row of rows) {
    const key = row.interview_at!.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

export default async function CalendarPage() {
  await requireProfile();
  const supabase = await createClient();

  // Interview-stage candidates plus anything explicitly scheduled.
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, full_name, status, interview_at, interview_qa, jobs(title), ai_evaluations(fit_score, interview_questions)"
    )
    .or("status.eq.interview,interview_at.not.is.null")
    .order("interview_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) console.error("calendar query failed:", error.message);

  const rows = (data ?? []) as unknown as InterviewRow[];
  const now = new Date().toISOString();
  const upcoming = rows.filter((r) => r.interview_at && r.interview_at >= now);
  const past = rows
    .filter((r) => r.interview_at && r.interview_at < now)
    .reverse();
  const unscheduled = rows.filter((r) => !r.interview_at);

  const isEmpty = rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.calendar.title}</h1>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <CalendarDays className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.calendar.emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {ar.calendar.emptyBody}
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{ar.calendar.upcoming}</h2>
              {[...groupByDay(upcoming)].map(([day, dayRows]) => (
                <div key={day} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden />
                    {formatDate(day)}
                  </h3>
                  {dayRows.map((row) => (
                    <InterviewCard key={row.id} row={row} />
                  ))}
                </div>
              ))}
            </section>
          )}

          {unscheduled.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {ar.calendar.unscheduled}{" "}
                  <Badge variant="secondary">{unscheduled.length}</Badge>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ar.calendar.unscheduledHint}
                </p>
              </div>
              {unscheduled.map((row) => (
                <InterviewCard key={row.id} row={row} />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-muted-foreground">
                {ar.calendar.past}
              </h2>
              {past.map((row) => (
                <InterviewCard key={row.id} row={row} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
