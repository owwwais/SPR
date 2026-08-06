import { revalidatePath } from "next/cache";

// Scoped revalidation (S3).
//
// Before multi-tenancy every job edit called revalidatePath("/jobs") and
// revalidatePath("/") — correct for one company, wasteful for many: a single
// busy tenant would keep throwing away pages belonging to everyone else.
//
// The split now follows what a page actually shows:
//   * a tenant's careers page depends on that tenant only  -> /c/{slug}
//   * the marketplace genuinely aggregates every tenant    -> /jobs, /companies, /
//     so invalidating it on any publish is right, not waste
//
// Tag-based invalidation (`cacheTag` + `revalidateTag`) would express this
// more precisely still, but in Next 16 those require `cacheComponents: true`,
// which changes prerendering semantics app-wide. That migration is worth
// doing on its own, not as a side effect of this milestone.

/** Pages that show one organization's own content. */
export function revalidateOrgPages(slug: string | null) {
  if (slug) revalidatePath(`/c/${slug}`);
}

/** Pages that aggregate across tenants. */
export function revalidateMarketplace() {
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/companies");
}

/**
 * A job changed: its own page, its company's careers page, and the shared
 * listings. Pass the slug so another tenant's careers page is left alone.
 */
export function revalidateJob(slug: string | null, jobId?: string) {
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  revalidateOrgPages(slug);
  revalidateMarketplace();
  revalidatePath("/admin/jobs");
}
