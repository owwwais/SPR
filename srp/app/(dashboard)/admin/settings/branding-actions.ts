"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateMarketplace, revalidateOrgPages } from "@/lib/revalidate";
import { ar } from "@/lib/i18n/ar";
import type { Database } from "@/types/database";

type OrganizationUpdate =
  Database["public"]["Tables"]["organizations"]["Update"];

export type BrandingState = {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // matches the bucket limit (0011)

const brandingSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE),
  about: z.string().trim().max(4000),
  website: z.union([z.string().trim().url().max(200), z.literal("")]),
  industry: z.string().trim().max(100),
  city: z.string().trim().max(100),
  brand_color: z.union([z.string().trim().regex(HEX_RE), z.literal("")]),
  listed_publicly: z.boolean(),
});

// Uploads land in org-assets/{org_id}/{kind}-{timestamp}.{ext}. The timestamp
// is what makes a replacement visible: the bucket is public and CDN-cached,
// so overwriting a fixed name would keep serving the old image.
async function uploadImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  kind: "logo" | "cover",
  file: File
): Promise<{ path?: string; error?: string }> {
  if (!(file.type in IMAGE_MIME)) return { error: "type" };
  if (file.size > IMAGE_MAX_BYTES) return { error: "size" };

  const path = `${orgId}/${kind}-${Date.now()}.${IMAGE_MIME[file.type]}`;
  const { error } = await supabase.storage
    .from("org-assets")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error(`${kind} upload failed:`, error.message);
    return { error: "upload" };
  }
  return { path };
}

export async function updateBranding(
  _prev: BrandingState,
  formData: FormData
): Promise<BrandingState> {
  const session = await requireOrgAdmin();
  const previousSlug = session.org.slug;

  const parsed = brandingSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    about: formData.get("about") ?? "",
    website: formData.get("website") ?? "",
    industry: formData.get("industry") ?? "",
    city: formData.get("city") ?? "",
    brand_color: formData.get("brand_color") ?? "",
    listed_publicly: formData.get("listed_publicly") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key === "slug") fieldErrors.slug = ar.branding.errors.slugFormat;
      else if (key === "website")
        fieldErrors.website = ar.branding.errors.website;
      else if (key === "brand_color")
        fieldErrors.brand_color = ar.branding.errors.color;
      else if (key === "name") fieldErrors.name = ar.branding.errors.name;
    }
    return { saved: false, error: ar.branding.errors.invalid, fieldErrors };
  }

  const supabase = await createClient();

  const update: OrganizationUpdate = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    about: parsed.data.about || null,
    website: parsed.data.website || null,
    industry: parsed.data.industry || null,
    city: parsed.data.city || null,
    brand_color: parsed.data.brand_color || null,
    listed_publicly: parsed.data.listed_publicly,
  };

  // Images are optional on every save; only a non-empty file replaces one.
  for (const kind of ["logo", "cover"] as const) {
    const file = formData.get(kind);
    if (file instanceof File && file.size > 0) {
      const result = await uploadImage(supabase, session.org.id, kind, file);
      if (result.error) {
        return {
          saved: false,
          error: ar.branding.errors.invalid,
          fieldErrors: {
            [kind]:
              result.error === "type"
                ? ar.branding.errors.imageType
                : result.error === "size"
                  ? ar.branding.errors.imageSize
                  : ar.branding.errors.upload,
          },
        };
      }
      if (kind === "logo") update.logo_path = result.path;
      else update.cover_path = result.path;
    }
  }

  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", session.org.id);
  if (error) {
    if (error.code === "23505") {
      return {
        saved: false,
        error: ar.branding.errors.slugTaken,
        fieldErrors: { slug: ar.branding.errors.slugTaken },
      };
    }
    if (error.code === "23514") {
      return {
        saved: false,
        error: ar.branding.errors.slugFormat,
        fieldErrors: { slug: ar.branding.errors.slugFormat },
      };
    }
    console.error("updateBranding failed:", error.message);
    return { saved: false, error: ar.branding.errors.serverError, fieldErrors: {} };
  }

  // A slug change moves the careers page, so the OLD path has to be dropped
  // as well or it keeps serving from cache under a URL that no longer exists.
  revalidateOrgPages(previousSlug);
  revalidateOrgPages(parsed.data.slug);
  revalidateMarketplace();
  revalidatePath("/admin/settings");

  return { saved: true, error: null, fieldErrors: {} };
}
