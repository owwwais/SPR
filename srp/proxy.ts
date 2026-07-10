import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Auth-relevant routes ONLY. Public pages (landing, jobs, apply, track)
  // never need session refresh — running the proxy there added a Supabase
  // Auth round trip to every public navigation, including ISR-cached hits.
  // The authoritative gate stays server-side in lib/auth.ts (D7).
  matcher: ["/admin/:path*", "/login"],
};
