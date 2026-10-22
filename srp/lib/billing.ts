import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Payment is a manual bank transfer for now (D20): a plan is REQUESTED here,
// and a platform admin confirms the transfer from /platform, which issues the
// invoice and applies the plan (0025). The provider abstraction D20 names
// (Moyasar next) arrives when card payment does; nothing here assumes it.

// SQLSTATEs raised by the 0025 limit triggers.
export const LIMIT_CODES = {
  activeJobs: "HK001",
  seats: "HK002",
} as const;

export type Plan = {
  code: string;
  name_ar: string;
  price_monthly_halalas: number;
  max_active_jobs: number | null;
  max_seats: number | null;
  monthly_analysis_quota: number | null;
  monthly_interview_quota: number | null;
  self_serve: boolean;
  sort_order: number;
};

export type Limits = {
  analyses: number | null;
  interviews: number | null;
  active_jobs: number | null;
  seats: number | null;
};

export type PlanRequest = {
  id: string;
  plan_code: string;
  amount_halalas: number;
  vat_halalas: number;
  reference: string;
  created_at: string;
};

export type Invoice = {
  number: string;
  plan_code: string;
  amount_halalas: number;
  vat_halalas: number;
  status: "open" | "paid" | "void" | "refunded";
  paid_at: string | null;
  period_end: string | null;
};

export type BillingOverview = {
  can_manage: boolean;
  status: string;
  plan: { code: string; name_ar: string; price_monthly_halalas: number } | null;
  limits: Limits;
  usage: {
    analyses: number;
    interviews: number;
    active_jobs: number;
    seats: number;
  };
  subscription: {
    plan_code: string;
    current_period_start: string;
    current_period_end: string | null;
  } | null;
  pending_request: PlanRequest | null;
  invoices: Invoice[] | null;
};

// One call per request, shared by the shell's usage meter and the billing
// page. `null` means the billing migration (0025) is not applied yet — the
// app deploys on merge and the migration is applied by hand, so every caller
// must render something sensible without it.
export const getBillingOverview = cache(
  async (orgId: string): Promise<BillingOverview | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("org_billing_overview", {
      p_org: orgId,
    });
    if (error) {
      console.error("org_billing_overview failed:", error.code, error.message);
      return null;
    }
    return data as BillingOverview;
  }
);

export const getPlans = cache(async (): Promise<Plan[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select(
      "code, name_ar, price_monthly_halalas, max_active_jobs, max_seats, monthly_analysis_quota, monthly_interview_quota, self_serve, sort_order"
    )
    .order("sort_order");
  if (error) {
    console.error("plans query failed:", error.code, error.message);
    return [];
  }
  return data as Plan[];
});

// Whole riyals render without decimals; halalas only when there are any.
export function formatSar(halalas: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: halalas % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(halalas / 100);
}

// Where the owner sends the transfer. Server-side environment, never
// hard-coded: the account is the business owner's to supply.
export function bankDetails(): {
  accountName: string;
  bankName: string;
  iban: string;
} | null {
  const accountName = process.env.BILLING_ACCOUNT_NAME?.trim();
  const bankName = process.env.BILLING_BANK_NAME?.trim();
  const iban = process.env.BILLING_IBAN?.trim();
  if (!accountName || !bankName || !iban) return null;
  return { accountName, bankName, iban };
}

// 0 of 0 is "not included", null is "no ceiling"; both differ from a number.
export function usageRatio(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit === 0) return 1;
  return Math.min(used / limit, 1);
}
