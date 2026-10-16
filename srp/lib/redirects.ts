// Only same-site paths. An open redirect would let a crafted link bounce a
// freshly authenticated user to a hostile site — after a password login and
// after an OAuth round trip alike.
export function safeNext(value: unknown, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
