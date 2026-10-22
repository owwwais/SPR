import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowRight,
  CircleCheck,
  FileText,
  Loader2,
  Lock,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisRefresher } from "@/components/seeker/portal/analysis-refresher";
import {
  ApplyWithProfileForm,
  type CvChoice,
} from "@/components/seeker/portal/apply-with-profile-form";
import { fileTypeLabel } from "@/components/seeker/portal/badges";
import { createPublicClient } from "@/lib/supabase/public";
import { requireSeeker } from "@/lib/seeker";
import { ScreeningQuestions } from "@/lib/validations/screening";
import { formatDate, todayISO } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { getAppliedJobIds } from "../../data";
import { applyWithProfile } from "../../actions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JobForApply = {
  id: string;
  title: string;
  closes_at: string | null;
  screening_questions: unknown;
  organizations: { name: string; slug: string } | null;
};

// The job exactly as the marketplace shows it: published, not deleted, its
// company live and listed. Read with the public (anon) client — what this
// page may show is what anyone may see, and nothing about the seeker is
// involved in finding it. submit-application repeats the open/live checks
// with the service role and derives the org from the job; this read only
// decides what to render.
const getJob = cache(async (id: string): Promise<JobForApply | null> => {
  if (!UUID_RE.test(id)) return null;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id,title,closes_at,screening_questions,organizations!inner(name,slug,status,listed_publicly,deleted_at)"
      )
      .eq("id", id)
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("organizations.listed_publicly", true)
      .is("organizations.deleted_at", null)
      .in("organizations.status", ["trial", "active"])
      .maybeSingle();
    if (error) {
      console.error("seeker apply job query failed:", error.message);
      return null;
    }
    return (data as unknown as JobForApply | null) ?? null;
  } catch (err) {
    console.warn(
      "seeker apply job unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getJob(jobId);
  const title = ar.seekerPortal.apply.title;
  return { title: job ? `${title}: ${job.title}` : title };
}

export default async function ApplyWithProfilePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  // The gate first, carrying this exact path: a signed-out visitor comes
  // back here after signing in, not to /me.
  const { profile } = await requireSeeker({ next: `/me/apply/${jobId}` });

  const job = await getJob(jobId);
  if (!job || !job.organizations) notFound();
  const company = job.organizations.name;

  const t = ar.seekerPortal.apply;
  const closed = job.closes_at !== null && job.closes_at < todayISO();
  const applied = (await getAppliedJobIds()).has(job.id);

  const doneVersions = profile.cv_versions.filter(
    (version) => version.analysis_status === "done"
  );
  const analysisRunning = profile.cv_versions.some(
    (version) =>
      version.analysis_status === "pending" ||
      version.analysis_status === "processing"
  );
  // cv_versions arrive newest first, so the first analysed one is the
  // default — the same version submit-application picks when none is named.
  const cvChoices: CvChoice[] = doneVersions.map((version, i) => {
    const label = t.cvOption
      .replace("{type}", fileTypeLabel(version.mime))
      .replace("{date}", formatDate(version.created_at));
    return { id: version.id, label: i === 0 ? `${label} (${t.cvNewest})` : label };
  });

  const questions = (() => {
    const parsed = ScreeningQuestions.safeParse(job.screening_questions);
    return parsed.success ? parsed.data : [];
  })();

  let body: React.ReactNode;
  if (applied) {
    body = (
      <Notice
        icon={<CircleCheck className="size-5 text-success" strokeWidth={1.75} aria-hidden />}
        title={t.alreadyAppliedTitle}
        text={t.alreadyAppliedBody}
        action={{ href: "/me/applications", label: t.goToApplications }}
      />
    );
  } else if (closed) {
    body = (
      <Notice
        icon={<Lock className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        title={t.closedTitle}
        text={ar.jobs.closedForApplications}
        action={{ href: "/me/jobs", label: ar.seekerPortal.home.browseJobs }}
      />
    );
  } else if (!profile.phone || !profile.full_name) {
    body = (
      <Notice
        icon={<Phone className="size-5 text-warning" strokeWidth={1.75} aria-hidden />}
        title={t.needPhoneTitle}
        text={t.needPhoneBody}
        action={{ href: "/me/profile", label: t.needPhoneAction }}
      />
    );
  } else if (cvChoices.length === 0) {
    body = (
      <>
        <AnalysisRefresher active={analysisRunning} />
        <Notice
          icon={
            analysisRunning ? (
              <Loader2
                className="size-5 text-muted-foreground motion-safe:animate-spin"
                strokeWidth={1.75}
                aria-hidden
              />
            ) : (
              <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            )
          }
          title={t.needCvTitle}
          text={analysisRunning ? t.needCvRunning : t.needCvBody}
          action={{ href: "/me/profile", label: t.needCvAction }}
        />
      </>
    );
  } else {
    const p = ar.seekerPortal.profile;
    body = (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="min-w-0 rounded-xl border bg-card p-5">
          <ApplyWithProfileForm
            action={applyWithProfile.bind(null, job.id)}
            company={company}
            cvChoices={cvChoices}
            questions={questions}
          />
        </div>

        {/* What travels with the application, stated before the consent is
            given — so on a phone, where the columns stack, it comes first.
            These are the profile's own values; the function reads them
            again from the database, not from this page. */}
        <aside
          aria-labelledby="shared-title"
          className="order-first flex flex-col gap-3 rounded-xl border bg-surface-soft/60 p-5 text-sm lg:order-none"
        >
          <h2 id="shared-title" className="font-semibold">
            {t.sharedTitle}
          </h2>
          <dl className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{p.fullName}</dt>
              <dd className="font-medium">{profile.full_name}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{p.email}</dt>
              <dd dir="ltr" className="break-all text-start">
                {profile.email}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{p.phone}</dt>
              <dd dir="ltr" className="text-start tabular-nums">
                {profile.phone}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{t.cvLabel}</dt>
              <dd className="text-body">{t.sharedCv}</dd>
            </div>
          </dl>
          <Link
            href="/me/profile"
            className="w-fit text-primary underline-offset-4 hover:underline"
          >
            {t.editDetails}
          </Link>
        </aside>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Link
          href={`/jobs/${job.id}`}
          className="mb-2 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {t.backToJob}
        </Link>
        <span className="text-sm font-medium text-primary">{company}</span>
        <h1 className="text-2xl font-bold sm:text-3xl">{job.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      {body}
    </>
  );
}

// One state, one action (DESIGN.md §9, empty state): an icon tile, a title,
// a line of help and the single thing to do next.
function Notice({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-2 rounded-xl border bg-card p-6">
      <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
        {icon}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button
        size="sm"
        className="mt-2"
        nativeButton={false}
        render={<Link href={action.href} />}
      >
        {action.label}
      </Button>
    </div>
  );
}
