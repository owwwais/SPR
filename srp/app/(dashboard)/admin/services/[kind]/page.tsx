import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpenCheck, ShieldCheck } from "lucide-react";
import { RunList } from "@/components/services/parts";
import { ServiceForm } from "@/components/services/service-form";
import { canWrite, requireMembership } from "@/lib/auth";
import { ar } from "@/lib/i18n/ar";
import { SERVICE_ICONS, listJobOptions, listRuns } from "@/lib/services";
import { isServiceKind } from "@/lib/validations/services";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: isServiceKind(kind) ? ar.services.kinds[kind].title : ar.services.title };
}

// One service: what it does and on what method, what it never does, the
// form, and this organization's earlier runs of it.
export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ kind }, sp] = await Promise.all([params, searchParams]);
  if (!isServiceKind(kind)) notFound();
  const session = await requireMembership();
  const t = ar.services;
  const k = t.kinds[kind];
  const Icon = SERVICE_ICONS[kind];
  const [jobs, runs] = await Promise.all([listJobOptions(session.org.id), listRuns(session.org.id, kind, 20)]);

  // Prefill only what a link inside the product sends (team → job need).
  const defaults: Record<string, string> = {};
  for (const key of ["title_hint", "problem", "tools", "level", "job_id"]) {
    const value = sp[key];
    if (typeof value === "string" && value.length <= 1500) defaults[key] = value;
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link
        href="/admin/services"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" aria-hidden />
        {t.allServices}
      </Link>

      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold sm:text-3xl">{k.title}</h1>
          <p className="max-w-[72ch] text-muted-foreground">{k.short}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label={t.run} className="rounded-xl border bg-card p-5 sm:p-6">
          <ServiceForm kind={kind} jobs={jobs} canRun={canWrite(session.role)} defaults={defaults} />
        </section>

        <aside className="flex flex-col gap-4">
          <section aria-labelledby="method-title" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 id="method-title" className="flex items-center gap-2 text-sm font-semibold">
              <BookOpenCheck className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
              {t.methodology}
            </h2>
            <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-body marker:text-muted-soft">
              {k.methodology.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="never-title" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 id="never-title" className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
              {t.neverDoes}
            </h2>
            <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-body marker:text-muted-soft">
              {k.never.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section aria-labelledby="history-title" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="history-title" className="border-b px-4 py-3 text-sm font-semibold">
          {t.history}
        </h2>
        {runs.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">{t.historyEmpty}</p>
        ) : (
          <RunList runs={runs} />
        )}
      </section>
    </div>
  );
}
