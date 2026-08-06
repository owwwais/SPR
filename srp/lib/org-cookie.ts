// The active organization is a hint, never an authorization (D12).
//
// A user may belong to several organizations (D14), so the workspace needs to
// know which one is on screen. That choice is kept in a cookie — but the
// cookie is only ever used to PICK from the memberships the database already
// returned. A tampered value names an org the user is not in, finds no match,
// and falls back to their first membership. It can never widen reach.

export const ACTIVE_ORG_COOKIE = "active_org";

export const ACTIVE_ORG_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;
