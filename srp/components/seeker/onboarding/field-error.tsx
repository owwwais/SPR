// The message under an input (DESIGN.md §9: errors in text-danger below the
// field). The id lets the input point at it with aria-describedby.
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}
