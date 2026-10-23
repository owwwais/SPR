import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RunList } from "@/components/services/parts";
import { requireMembership } from "@/lib/auth";
import { ar } from "@/lib/i18n/ar";
import { SERVICE_ICONS, SERVICE_ORDER, listRuns } from "@/lib/services";

export const metadata: Metadata = { title: ar.services.title };

// The services hub (D34). The catalog is static; the only read is this
// organization's recent runs. No model call happens here (§8).
export default async function ServicesPage() {
  const session = await requireMembership();
  const t = ar.services;
  const runs = await listRuns(session.org.id, undefined, 8);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[72ch] text-muted-foreground">{t.subtitle}</p>
        <p className="text-sm text-muted-foreground">{t.costNote}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SERVICE_ORDER.map((kind) => {
          const Icon = SERVICE_ICONS[kind];
          const k = t.kinds[kind];
          return (
            <li key={kind} className="flex">
              <Link
                href={`/admin/services/${kind}`}
                className="group flex w-full flex-col gap-3 rounded-xl border bg-card p-5 transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-[0_1px_2px_oklch(0.216_0.029_257.5/0.05)] focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-base font-semibold">{k.title}</span>
                <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{k.short}</span>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  {t.start}
                  <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="recent-title" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="recent-title" className="border-b px-4 py-3 text-sm font-semibold">
          {t.recent}
        </h2>
        {runs.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">{t.recentEmpty}</p>
        ) : (
          <RunList runs={runs} showKind />
        )}
      </section>
    </div>
  );
}
