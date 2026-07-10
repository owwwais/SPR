import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRight } from "lucide-react";
import { ApplyForm } from "@/components/jobs/apply-form";
import { createPublicClient } from "@/lib/supabase/public";
import { ar } from "@/lib/i18n/ar";
import { todayISO } from "@/lib/format";
import { submitApplication } from "./actions";

export const revalidate = 60;

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getJob = cache(async (id: string) => {
  if (!UUID_RE.test(id)) return null;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,closes_at")
      .eq("id", id)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("apply page job query failed:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("apply page unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);
  return { title: job ? `${ar.apply.title}: ${job.title}` : ar.apply.title };
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const applicationsClosed =
    job.closes_at !== null && job.closes_at < todayISO();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div>
        <Link
          href={`/jobs/${job.id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {job.title}
        </Link>
        <h1 className="text-3xl font-bold">{ar.apply.title}</h1>
        <p className="mt-2 text-muted-foreground">{ar.apply.subtitle}</p>
      </div>

      {applicationsClosed ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center text-muted-foreground">
          {ar.jobs.closedForApplications}
        </div>
      ) : (
        <ApplyForm action={submitApplication.bind(null, job.id)} />
      )}
    </section>
  );
}
