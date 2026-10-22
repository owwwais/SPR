import { Check, ChevronDown, Clock3, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsageMeter } from "@/components/admin/usage-meter";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatSar, getPlans, type Limits, type Plan, type PlanRequest } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { createClient } from "@/lib/supabase/server";
import {
  platformApplyPlan,
  platformConfirmRequest,
  platformRejectRequest,
  platformSetLimits,
} from "./actions";

type PlatformOrg = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_code: string | null;
  limits: Limits;
  usage: { analyses: number; active_jobs: number; seats: number };
  period_end: string | null;
  pending_request: PlanRequest | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25";

const STATUS_VARIANT: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  trial: "secondary",
  past_due: "warning",
  suspended: "destructive",
  cancelled: "destructive",
};

function planName(plans: Plan[], code: string | null) {
  if (!code) return "—";
  return plans.find((p) => p.code === code)?.name_ar ?? code;
}

function Ratio({ used, limit }: { used: number; limit: number | null }) {
  const over = limit !== null && limit > 0 && used >= limit;
  return (
    <bdi className={over ? "font-semibold text-destructive" : undefined}>
      {used}
      {limit === null ? "" : ` ${ar.billing.meter.of} ${limit}`}
    </bdi>
  );
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; q?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const t = ar.platform;

  const supabase = await createClient();
  const [overviewRes, plans] = await Promise.all([
    supabase.rpc("platform_billing_overview"),
    getPlans(),
  ]);
  if (overviewRes.error) {
    console.error("platform_billing_overview failed:", overviewRes.error.code, overviewRes.error.message);
  }
  const orgs = overviewRes.error ? null : ((overviewRes.data ?? []) as PlatformOrg[]);

  const q = (sp.q ?? "").trim().toLowerCase();
  const pending = orgs?.filter((o) => o.pending_request) ?? [];
  const listed =
    orgs?.filter(
      (o) => !q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
    ) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      {sp.done && t.done[sp.done] && (
        <Alert>
          <Check className="size-4" aria-hidden />
          <AlertDescription>{t.done[sp.done]}</AlertDescription>
        </Alert>
      )}
      {sp.error && t.errors[sp.error] && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors[sp.error]}</AlertDescription>
        </Alert>
      )}

      {!orgs ? (
        <Alert>
          <AlertDescription>{t.unavailable}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section aria-labelledby="pending-title" className="flex flex-col gap-3">
            <h2 id="pending-title" className="flex items-center gap-2 font-semibold">
              <Clock3 className="size-4 text-primary" aria-hidden />
              {t.pendingTitle}
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                <bdi>{pending.length}</bdi>
              </span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.pendingEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((org) => (
                  <PendingRow key={org.id} org={org} plans={plans} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="orgs-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="orgs-title" className="font-semibold">
                {t.orgsTitle}{" "}
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  <bdi>{orgs.length}</bdi> {t.orgsCount}
                </span>
              </h2>
              <form role="search" className="flex w-full max-w-sm items-center gap-2">
                <Label htmlFor="platform-q" className="sr-only">
                  {t.search}
                </Label>
                <Input id="platform-q" name="q" defaultValue={sp.q ?? ""} placeholder={t.search} />
                <Button type="submit" variant="outline" size="icon" title={t.searchButton}>
                  <Search className="size-4" aria-hidden />
                  <span className="sr-only">{t.searchButton}</span>
                </Button>
              </form>
            </div>

            {listed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.orgsEmpty}</p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div
                  aria-hidden
                  className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_1.25rem] gap-4 border-b bg-surface-soft px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
                >
                  <span>{t.columns.org}</span>
                  <span>{t.columns.plan}</span>
                  <span>{t.columns.usage}</span>
                  <span>{t.columns.periodEnd}</span>
                  <span />
                </div>
                <ul className="divide-y">
                  {listed.map((org) => (
                    <OrgRow key={org.id} org={org} plans={plans} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PendingRow({ org, plans }: { org: PlatformOrg; plans: Plan[] }) {
  const t = ar.platform;
  const request = org.pending_request!;
  const isContact = request.amount_halalas === 0;

  return (
    <li className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{org.name}</span>
          <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
            {org.slug}
          </bdi>
        </span>
        <span className="text-sm text-body">
          {t.requested} <strong>{planName(plans, request.plan_code)}</strong>{" "}
          <span className="text-muted-foreground">
            · {t.currentPlan} {planName(plans, org.plan_code)}
          </span>
        </span>
        {isContact ? (
          <span className="text-sm text-muted-foreground">{t.contactRequest}</span>
        ) : (
          <span className="text-sm">
            {t.total}:{" "}
            <strong className="tabular-nums">
              <bdi>{formatSar(request.amount_halalas + request.vat_halalas)}</bdi>
            </strong>{" "}
            {ar.billing.sar}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <bdi dir="ltr" className="font-mono text-sm font-semibold text-foreground">
            {request.reference}
          </bdi>
          <span>{formatDate(request.created_at)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {isContact ? (
          <p className="text-sm text-muted-foreground">{t.contactHint}</p>
        ) : (
          <form
            action={platformConfirmRequest.bind(null, request.id)}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`ref-${request.id}`} className="text-xs text-muted-foreground">
                {t.paymentRef}
              </Label>
              <Input
                id={`ref-${request.id}`}
                name="payment_ref"
                dir="ltr"
                maxLength={120}
                placeholder={t.paymentRefPlaceholder}
              />
            </div>
            <Button type="submit">{t.confirm}</Button>
          </form>
        )}
        <form
          action={platformRejectRequest.bind(null, request.id)}
          className="flex flex-col gap-1.5 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`note-${request.id}`} className="text-xs text-muted-foreground">
              {t.rejectNote}
            </Label>
            <Input id={`note-${request.id}`} name="note" maxLength={300} />
          </div>
          <Button type="submit" variant="outline">
            {isContact ? t.closeRequest : t.reject}
          </Button>
        </form>
      </div>
    </li>
  );
}

function OrgRow({ org, plans }: { org: PlatformOrg; plans: Plan[] }) {
  const t = ar.platform;
  const lim = org.limits;
  const statusLabel =
    ar.billing.statuses[org.status as keyof typeof ar.billing.statuses] ?? org.status;

  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm transition-colors hover:bg-surface-soft md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_1.25rem] [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-col items-start">
            <span className="max-w-full truncate font-medium">{org.name}</span>
            <bdi dir="ltr" className="max-w-full truncate font-mono text-xs text-muted-foreground">
              {org.slug}
            </bdi>
          </span>
          <span className="col-start-2 row-start-1 md:hidden">
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
          <span className="flex flex-wrap items-center gap-1.5 max-md:col-start-1">
            {planName(plans, org.plan_code)}
            <Badge variant={STATUS_VARIANT[org.status] ?? "secondary"}>{statusLabel}</Badge>
            {org.pending_request && (
              <Badge variant="default">
                <Clock3 aria-hidden />
                {t.requested}
              </Badge>
            )}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums max-md:col-start-1">
            <span>
              {t.usageShort.analyses} <Ratio used={org.usage.analyses} limit={lim.analyses} />
            </span>
            <span>
              {t.usageShort.activeJobs} <Ratio used={org.usage.active_jobs} limit={lim.active_jobs} />
            </span>
            <span>
              {t.usageShort.seats} <Ratio used={org.usage.seats} limit={lim.seats} />
            </span>
          </span>
          <span className="text-xs text-muted-foreground max-md:col-start-1">
            {org.period_end ? formatDate(org.period_end) : "—"}
          </span>
          <span className="hidden md:block">
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
            <span className="sr-only">{t.manage}</span>
          </span>
        </summary>

        <div className="grid gap-6 border-t bg-surface-soft/60 px-4 py-5 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <UsageMeter compact label={ar.billing.limits.analyses} used={org.usage.analyses} limit={lim.analyses} />
            <UsageMeter compact label={ar.billing.limits.activeJobs} used={org.usage.active_jobs} limit={lim.active_jobs} />
            <UsageMeter compact label={ar.billing.limits.seats} used={org.usage.seats} limit={lim.seats} />
          </div>

          <form action={platformApplyPlan.bind(null, org.id)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold">{t.applyTitle}</h3>
              <p className="text-xs text-muted-foreground">{t.applyHint}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`plan-${org.id}`} className="text-xs text-muted-foreground">
                {t.planLabel}
              </Label>
              <select
                id={`plan-${org.id}`}
                name="plan"
                defaultValue={org.plan_code ?? "trial"}
                className={selectClass}
              >
                {plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`apply-note-${org.id}`} className="text-xs text-muted-foreground">
                {t.noteLabel}
              </Label>
              <Input id={`apply-note-${org.id}`} name="note" maxLength={300} />
            </div>
            <Button type="submit" variant="outline" className="w-fit">
              {t.apply}
            </Button>
          </form>

          <form action={platformSetLimits.bind(null, org.id)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold">{t.limitsTitle}</h3>
              <p className="text-xs text-muted-foreground">{t.limitsHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["analyses", ar.billing.planRows.analyses, lim.analyses],
                  ["interviews", ar.billing.planRows.interviews, lim.interviews],
                  ["active_jobs", ar.billing.planRows.jobs, lim.active_jobs],
                  ["seats", ar.billing.planRows.seats, lim.seats],
                ] as const
              ).map(([name, label, value]) => (
                <div key={name} className="flex flex-col gap-1.5">
                  <Label htmlFor={`${name}-${org.id}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    id={`${name}-${org.id}`}
                    name={name}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    dir="ltr"
                    defaultValue={value ?? ""}
                    placeholder={ar.billing.unlimitedShort}
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>
            <Button type="submit" variant="outline" className="w-fit">
              {t.saveLimits}
            </Button>
          </form>
        </div>
      </details>
    </li>
  );
}
