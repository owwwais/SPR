// Only same-site paths. An open redirect would let a crafted link bounce a
// freshly authenticated user to a hostile site — after a password login and
// after an OAuth round trip alike.
//
// Prefix checks alone are not enough: browsers (and new URL()) resolve a
// Location header with the WHATWG parser, which first strips ASCII tab and
// newline characters, so "/\t/evil.com" passes a "not //" check and then
// lands on //evil.com. The value is therefore resolved the way a browser
// would resolve it, against a placeholder origin, and accepted only if it
// stays on that origin; what is returned is the normalised path, never the
// raw input.
const PLACEHOLDER_ORIGIN = "https://same-site.invalid";

export function safeNext(value: unknown, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  // Control characters and backslashes have no business in our own paths.
  if (!next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
