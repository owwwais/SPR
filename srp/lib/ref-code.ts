// Short public tracking code (applications.ref_code). Alphabet avoids
// ambiguous characters (0/O, 1/I/L). 8 chars over 31 symbols ≈ 39 bits —
// unguessable enough for a tracking code; uniqueness is enforced by the
// DB constraint with insert-retry on collision.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRefCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return `SRP-${code}`;
}
