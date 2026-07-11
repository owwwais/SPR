import type { Metadata } from "next";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { arSA } from "date-fns/locale";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageCircleQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/admin/score-badge";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import { formatDateTime } from "@/lib/format";
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
          render={
            <Link href={`/admin/applications/${row.id}?tab=interview`} />
          }
        >
          {ar.calendar.manage}
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  await requireProfile();
  const sp = await searchParams;

  // Visible month (?m=YYYY-MM), defaulting to the current month.
  const monthBase = /^\d{4}-\d{2}$/.test(sp.m ?? "")
    ? new Date(`${sp.m}-01T00:00:00`)
    : new Date();
  const monthStart = startOfMonth(monthBase);
  // Saudi week starts on Saturday (weekStartsOn: 6).
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const gridEnd = endOfWeek(endOfMonth(monthBase), { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, full_name, status, interview_at, interview_qa, jobs(title), ai_evaluations(fit_score, interview_questions)"
    )
    .or("status.eq.interview,interview_at.not.is.null")
    .order("interview_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) console.error("calendar query failed:", error.message);

  const rows = (data ?? []) as unknown as InterviewRow[];
  const scheduled = rows.filter((r) => r.interview_at);
  const unscheduled = rows.filter(
    (r) => !r.interview_at && r.status === "interview"
  );

  // interviews per visible day (local day key)
  const byDay = new Map<string, InterviewRow[]>();
  for (const row of scheduled) {
    const key = format(new Date(row.interview_at!), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }

  const now = new Date().toISOString();
  const upcoming = scheduled.filter((r) => r.interview_at! >= now);

  const monthParam = (date: Date) => format(date, "yyyy-MM");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{ar.calendar.title}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            title={ar.calendar.prevMonth}
            nativeButton={false}
            render={
              <Link
                href={`/admin/calendar?m=${monthParam(addMonths(monthStart, -1))}`}
              />
            }
          >
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">{ar.calendar.prevMonth}</span>
          </Button>
          <span className="min-w-32 text-center font-semibold">
            {format(monthStart, "MMMM yyyy", { locale: arSA })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            title={ar.calendar.nextMonth}
            nativeButton={false}
            render={
              <Link
                href={`/admin/calendar?m=${monthParam(addMonths(monthStart, 1))}`}
              />
            }
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only">{ar.calendar.nextMonth}</span>
          </Button>
        </div>
      </div>

      {/* ----------------------------- month grid ----------------------------- */}
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold text-muted-foreground">
            {ar.calendar.weekdays.map((day) => (
              <div key={day} className="px-1 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayRows = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, monthStart);
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 border-b border-e p-1.5",
                    !inMonth && "bg-muted/30 text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday && "bg-primary font-bold text-primary-foreground"
                    )}
                    title={isToday ? ar.calendar.today : undefined}
                  >
                    {format(day, "d")}
                  </span>
                  {dayRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/admin/applications/${row.id}?tab=interview`}
                      className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20"
                      title={`${row.full_name} — ${formatDateTime(row.interview_at!)}`}
                    >
                      <span dir="ltr" className="tabular-nums">
                        {format(new Date(row.interview_at!), "HH:mm")}
                      </span>{" "}
                      {row.full_name}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

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

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{ar.calendar.upcoming}</h2>
          {upcoming.map((row) => (
            <InterviewCard key={row.id} row={row} />
          ))}
        </section>
      )}

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{ar.calendar.emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {ar.calendar.emptyBody}
          </p>
        </div>
      )}
    </div>
  );
}
