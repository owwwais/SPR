import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

// New password + confirmation, posted as `password` and `confirm`. The server
// action re-checks both (readNewPassword in app/auth/actions.ts).
export function NewPasswordFields({ idPrefix = "new" }: { idPrefix?: string }) {
  const t = ar.auth.reset;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-password`}>{t.newPassword}</Label>
        <Input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          dir="ltr"
          aria-describedby={`${idPrefix}-password-hint`}
          className="text-start"
        />
        <p id={`${idPrefix}-password-hint`} className="text-xs text-muted-foreground">
          {ar.auth.passwordHint}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-confirm`}>{t.confirmPassword}</Label>
        <Input
          id={`${idPrefix}-confirm`}
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          dir="ltr"
          className="text-start"
        />
      </div>
    </>
  );
}
