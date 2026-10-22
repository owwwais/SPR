import type { Metadata } from "next";
import { Check, Clock3, Landmark } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsageMeter } from "@/components/admin/usage-meter";
import { requireMembership } from "@/lib/auth";
import {
  bankDetails,
  formatSar,
  getBillingOverview,
  getPlans,
  type BillingOverview,
  type Plan,
} from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";
import { cancelPlanRequest, requestPlanChange } from "./actions";

export const metadata: Metadata = { title: ar.billing.title };

function priceLabel(plan: Pick<Plan, "code" | "price_monthly_halalas" | "self_serve">) {
  const t = ar.billing;
  if (!plan.self_serve && plan.price_monthly_halalas === 0 && plan.code !== "trial") {
    return { amount: t.custom, unit: null };
  }
  if (plan.price_monthly_halalas === 0) return { amount: t.free, unit: null };
  return { amount: formatSar(plan.price_monthly_halalas), unit: t.perMonth };
}

function limitValue(value: number | null) {
  if (value === null) return ar.billing.unlimitedShort;
  if (value === 0) return ar.billing.notIncludedShort;
  return String(value);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const session = await requireMembership();
  const sp = await searchParams;
  const t = ar.billing;

  const [overview, plans] = await Promise.all([
    getBillingOverview(session.org.id),
    getPlans(),
  ]);

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      {!overview ? (
        <Alert>
          <AlertDescription>{t.unavailable}</AlertDescription>
        </Alert>
      ) : (
        <BillingBody
          overview={overview}
          plans={plans}
          requested={sp.requested === "1"}
          error={sp.error ? t.errors[sp.error] : undefined}
        />
      )}
    </div>
  );
}

function BillingBody({
  overview,
  plans,
  requested,
  error,
}: {
  overview: BillingOverview;
  plans: Plan[];
  requested: boolean;
  error: string | undefined;
}) {
  const t = ar.billing;
  const currentCode = overview.plan?.code ?? "trial";
  const current = plans.find((p) => p.code === currentCode);
  const currentPrice = current ? priceLabel(current) : null;
  const pending = overview.pending_request;
  const pendingPlan = pending ? plans.find((p) => p.code === pending.plan_code) : null;
  const bank = bankDetails();

  return (
    <>
      {/* Current plan: one line, the facts that matter. */}
      <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t.current}</span>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-bold">{overview.plan?.name_ar ?? currentCode}</span>
            {currentPrice && (
              <span className="text-sm text-muted-foreground">
                <bdi className="tabular-nums">{currentPrice.amount}</bdi>
                {currentPrice.unit && <> {currentPrice.unit}</>}
              </span>
            )}
            <Badge variant="secondary">
              {t.statuses[overview.status as keyof typeof t.statuses] ?? overview.status}
            </Badge>
          </div>
        </div>
        {overview.subscription?.current_period_end && (
          <span className="text-sm text-muted-foreground">
            {t.paidUntil} {formatDate(overview.subscription.current_period_end)}
          </span>
        )}
      </section>

      {requested && (
        <Alert>
          <Check className="size-4" aria-hidden />
          <AlertDescription>{t.requested}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pending && (
        <section
          aria-labelledby="pending-title"
          className="grid gap-6 rounded-xl border border-primary/30 bg-primary-soft/50 p-5 lg:grid-cols-[1fr_1fr]"
        >
          <div className="flex flex-col gap-3">
            <h2 id="pending-title" className="flex items-center gap-2 font-semibold">
              <Clock3 className="size-4 text-primary" aria-hidden />
              {t.pending.title}
            </h2>
            {pending.amount_halalas === 0 ? (
              <p className="text-sm text-body">{t.pending.contactBody}</p>
            ) : (
              <>
                <p className="text-sm text-body">
                  {t.pending.body} <strong>{pendingPlan?.name_ar ?? pending.plan_code}</strong>.{" "}
                  {t.pending.activation}
                </p>
                <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t.pending.subtotal}</dt>
                  <dd className="text-end tabular-nums">
                    <bdi>{formatSar(pending.amount_halalas)}</bdi> {t.sar}
                  </dd>
                  <dt className="text-muted-foreground">{t.pending.vat}</dt>
                  <dd className="text-end tabular-nums">
                    <bdi>{formatSar(pending.vat_halalas)}</bdi> {t.sar}
                  </dd>
                  <dt className="border-t pt-1.5 font-semibold">{t.pending.total}</dt>
                  <dd className="border-t pt-1.5 text-end font-semibold tabular-nums">
                    <bdi>{formatSar(pending.amount_halalas + pending.vat_halalas)}</bdi> {t.sar}
                  </dd>
                </dl>
              </>
            )}
            {overview.can_manage && (
              <form action={cancelPlanRequest.bind(null, pending.id)}>
                <Button type="submit" variant="ghost" size="sm" className="-ms-2.5">
                  {t.pending.cancel}
                </Button>
              </form>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">{t.pending.reference}</span>
              <bdi dir="ltr" className="text-start font-mono text-lg font-semibold tracking-normal">
                {pending.reference}
              </bdi>
              <span className="text-xs text-muted-foreground">{t.pending.referenceHint}</span>
            </div>
            {pending.amount_halalas > 0 && (
              <div className="flex flex-col gap-1.5 border-t pt-3 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Landmark className="size-4 text-muted-foreground" aria-hidden />
                  {t.pending.bankTitle}
                </span>
                {bank ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">{t.pending.accountName}</dt>
                    <dd>{bank.accountName}</dd>
                    <dt className="text-muted-foreground">{t.pending.bankName}</dt>
                    <dd>{bank.bankName}</dd>
                    <dt className="text-muted-foreground">{t.pending.iban}</dt>
                    <dd dir="ltr" className="text-start font-mono">
                      {bank.iban}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-muted-foreground">{t.pending.noBank}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="usage-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="usage-title" className="font-semibold">{t.usageTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.usageHint}</p>
        </div>
        <div className="grid gap-x-10 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <UsageMeter label={t.limits.analyses} used={overview.usage.analyses} limit={overview.limits.analyses} />
          <UsageMeter label={t.limits.activeJobs} used={overview.usage.active_jobs} limit={overview.limits.active_jobs} />
          <UsageMeter label={t.limits.seats} used={overview.usage.seats} limit={overview.limits.seats} />
          <UsageMeter label={t.limits.interviews} used={overview.usage.interviews} limit={overview.limits.interviews} />
        </div>
      </section>

      <section aria-labelledby="plans-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="plans-title" className="font-semibold">{t.plansTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.plansHint}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              current={plan.code === currentCode}
              pending={pending?.plan_code === plan.code}
              currentOrder={current?.sort_order ?? 0}
              canManage={overview.can_manage}
            />
          ))}
        </ul>
        {!overview.can_manage && (
          <p className="text-xs text-muted-foreground">{t.askOwner}</p>
        )}
      </section>

      {overview.can_manage && overview.invoices && (
        <section aria-labelledby="invoices-title" className="flex flex-col gap-3">
          <h2 id="invoices-title" className="font-semibold">{t.invoicesTitle}</h2>
          {overview.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.invoicesEmpty}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.invoice.number}</TableHead>
                    <TableHead>{t.invoice.plan}</TableHead>
                    <TableHead className="text-end">{t.invoice.total}</TableHead>
                    <TableHead>{t.invoice.paidAt}</TableHead>
                    <TableHead>{t.invoice.periodEnd}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.invoices.map((inv) => (
                    <TableRow key={inv.number}>
                      <TableCell>
                        <bdi dir="ltr" className="font-mono text-xs">{inv.number}</bdi>
                      </TableCell>
                      <TableCell>
                        {plans.find((p) => p.code === inv.plan_code)?.name_ar ?? inv.plan_code}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        <bdi>{formatSar(inv.amount_halalas + inv.vat_halalas)}</bdi> {t.sar}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.period_end ? formatDate(inv.period_end) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function PlanCard({
  plan,
  current,
  pending,
  currentOrder,
  canManage,
}: {
  plan: Plan;
  current: boolean;
  pending: boolean;
  currentOrder: number;
  canManage: boolean;
}) {
  const t = ar.billing;
  const price = priceLabel(plan);
  const recommended = plan.code === "growth" && !current;
  const extras = t.extras[plan.code] ?? [];
  const rows: [string, number | null][] = [
    [t.planRows.jobs, plan.max_active_jobs],
    [t.planRows.seats, plan.max_seats],
    [t.planRows.analyses, plan.monthly_analysis_quota],
    [t.planRows.interviews, plan.monthly_interview_quota],
  ];

  return (
    <li
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5",
        current && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex min-h-14 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{plan.name_ar}</h3>
          {current ? (
            <Badge>{t.current}</Badge>
          ) : recommended ? (
            <Badge variant="secondary">{t.recommended}</Badge>
          ) : null}
        </div>
        <p className="flex items-baseline gap-1.5">
          <bdi className="text-2xl font-bold tabular-nums">{price.amount}</bdi>
          {price.unit && <span className="text-xs text-muted-foreground">{price.unit}</span>}
        </p>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 border-t pt-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-end font-medium tabular-nums">{limitValue(value)}</dd>
          </div>
        ))}
      </dl>

      {extras.length > 0 && (
        <ul className="flex flex-1 flex-col gap-1.5 text-sm">
          {extras.map((extra) => (
            <li key={extra} className="flex items-start gap-2">
              <Check className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="text-body">
                {extra}
                {t.soonFeatures.includes(extra) && (
                  <Badge variant="outline" className="ms-1.5 align-middle text-[0.7rem]">
                    {t.comingSoon}
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && !current && plan.code !== "trial" && (
        <form action={requestPlanChange.bind(null, plan.code)} className="mt-auto">
          <Button
            type="submit"
            className="w-full"
            variant={recommended ? "default" : "outline"}
            disabled={pending}
          >
            {!plan.self_serve
              ? t.contact
              : plan.sort_order < currentOrder
                ? t.requestDowngrade
                : t.request}
          </Button>
        </form>
      )}
    </li>
  );
}
