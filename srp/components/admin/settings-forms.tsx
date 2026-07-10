"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateMemberRole,
  updateSettings,
  type SettingsState,
} from "@/app/(dashboard)/admin/settings/actions";
import { ar } from "@/lib/i18n/ar";
import type { UserRole } from "@/types/database";

const initialState: SettingsState = { saved: false, error: null };

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Feedback({ state, pending }: { state: SettingsState; pending: boolean }) {
  if (pending) return null;
  if (state.saved)
    return (
      <span className="flex items-center gap-1 text-sm text-emerald-600">
        <Check className="size-4" aria-hidden />
        {ar.settingsPage.saved}
      </span>
    );
  if (state.error)
    return <span className="text-sm text-destructive">{state.error}</span>;
  return null;
}

export function CompanySettingsForm({
  companyName,
  retentionMonths,
}: {
  companyName: string;
  retentionMonths: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateSettings,
    initialState
  );
  const t = ar.settingsPage;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="company_name">{t.companyName}</Label>
        <Input
          id="company_name"
          name="company_name"
          maxLength={200}
          defaultValue={companyName}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="retention_months">{t.retention}</Label>
        <Input
          id="retention_months"
          name="retention_months"
          type="number"
          min={1}
          max={60}
          required
          defaultValue={retentionMonths}
          className="max-w-32"
        />
        <p className="text-xs text-muted-foreground">{t.retentionHint}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        <Feedback state={state} pending={pending} />
      </div>
    </form>
  );
}

export function MemberRoleForm({
  memberId,
  currentRole,
}: {
  memberId: string;
  currentRole: UserRole;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberRole.bind(null, memberId),
    initialState
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="role"
        defaultValue={currentRole}
        className={selectClass}
        aria-label={ar.settingsPage.role}
      >
        <option value="hr">{ar.admin.roles.hr}</option>
        <option value="admin">{ar.admin.roles.admin}</option>
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? ar.settingsPage.saving : ar.settingsPage.save}
      </Button>
      {state.saved && !pending && (
        <Check className="size-4 text-emerald-600" aria-hidden />
      )}
      {state.error && !pending && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

export function MemberRoleBadge({ role }: { role: UserRole }) {
  return <Badge variant="secondary">{ar.admin.roles[role]}</Badge>;
}
