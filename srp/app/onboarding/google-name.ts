// A Google sign-in arrives with the person's name; offering it saves typing.
// Display only — the name is submitted and validated like any other input,
// and nothing about tenancy or hats is ever read from user_metadata (D12,
// D26), which the user can write.
export function googleName(metadata: Record<string, unknown> | undefined): string {
  const value = metadata?.full_name ?? metadata?.name;
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
