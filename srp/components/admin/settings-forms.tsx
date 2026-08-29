"use client";

import { useActionState, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createMember,
  inviteMember,
  revokeInvitation,
  updateMemberRole,
  updateSettings,
  updateCompliance,
  type SettingsState,
} from "@/app/(dashboard)/admin/settings/actions";
import { ar } from "@/lib/i18n/ar";
import type { MemberRole } from "@/types/database";

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
  // Controlled fields synced with the server values after revalidation
  // (uncontrolled defaultValue must never change after mount — Base UI
  // warns and the displayed value would go stale).
  const [name, setName] = useState(companyName);
  const [months, setMonths] = useState(String(retentionMonths));
  const [prev, setPrev] = useState({ companyName, retentionMonths });
  if (
    prev.companyName !== companyName ||
    prev.retentionMonths !== retentionMonths
  ) {
    setPrev({ companyName, retentionMonths });
    setName(companyName);
    setMonths(String(retentionMonths));
  }
  const t = ar.settingsPage;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="company_name">{t.companyName}</Label>
        <Input
          id="company_name"
          name="company_name"
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          value={months}
          onChange={(e) => setMonths(e.target.value)}
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

// Blind screening + Nitaqat. Both are organisation-level compliance settings
// an admin sets once, so they share one form and one save.
export function ComplianceForm({
  blindScreening,
  nitaqatBand,
  saudizationTarget,
}: {
  blindScreening: boolean;
  nitaqatBand: string | null;
  saudizationTarget: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateCompliance,
    initialState
  );
  const [blind, setBlind] = useState(blindScreening);
  const [band, setBand] = useState(nitaqatBand ?? "");
  const [target, setTarget] = useState(
    saudizationTarget === null ? "" : String(saudizationTarget)
  );
  const [prev, setPrev] = useState({
    blindScreening,
    nitaqatBand,
    saudizationTarget,
  });
  if (
    prev.blindScreening !== blindScreening ||
    prev.nitaqatBand !== nitaqatBand ||
    prev.saudizationTarget !== saudizationTarget
  ) {
    setPrev({ blindScreening, nitaqatBand, saudizationTarget });
    setBlind(blindScreening);
    setBand(nitaqatBand ?? "");
    setTarget(saudizationTarget === null ? "" : String(saudizationTarget));
  }

  const b = ar.blindScreening;
  const sa = ar.saudization;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <input
            id="blind_screening"
            name="blind_screening"
            type="checkbox"
            checked={blind}
            onChange={(e) => setBlind(e.target.checked)}
            className="mt-1 size-4"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="blind_screening">{b.enable}</Label>
            <p className="text-xs text-muted-foreground">{b.body}</p>
            {/* Stated plainly: it is the reason this is off by default. */}
            <p className="text-xs font-medium text-amber-700">{b.cost}</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-5">
        <h3 className="mb-1 text-sm font-semibold">{sa.title}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{sa.body}</p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nitaqat_band">{sa.band}</Label>
            <select
              id="nitaqat_band"
              name="nitaqat_band"
              value={band}
              onChange={(e) => setBand(e.target.value)}
              className="h-9 max-w-56 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">{sa.noBand}</option>
              {(
                Object.keys(sa.bands) as (keyof typeof sa.bands)[]
              ).map((key) => (
                <option key={key} value={key}>
                  {sa.bands[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="saudization_target">{sa.target}</Label>
            <Input
              id="saudization_target"
              name="saudization_target"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="max-w-32"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? ar.settingsPage.saving : ar.settingsPage.save}
        </Button>
        <Feedback state={state} pending={pending} />
      </div>
    </form>
  );
}

export function MemberRoleForm({
  memberId,
  currentRole,
  canAssignOwner,
}: {
  memberId: string;
  currentRole: MemberRole;
  /** Only an owner may hand ownership to someone else (0006 policy). */
  canAssignOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberRole.bind(null, memberId),
    initialState
  );
  const [role, setRole] = useState<MemberRole>(currentRole);
  const [prevRole, setPrevRole] = useState<MemberRole>(currentRole);
  if (prevRole !== currentRole) {
    setPrevRole(currentRole);
    setRole(currentRole);
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as MemberRole)}
        className={selectClass}
        aria-label={ar.settingsPage.role}
      >
        <option value="viewer">{ar.admin.roles.viewer}</option>
        <option value="hr">{ar.admin.roles.hr}</option>
        <option value="admin">{ar.admin.roles.admin}</option>
        {(canAssignOwner || currentRole === "owner") && (
          <option value="owner">{ar.admin.roles.owner}</option>
        )}
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

export function MemberRoleBadge({ role }: { role: MemberRole }) {
  return <Badge variant="secondary">{ar.admin.roles[role]}</Badge>;
}

// Admin creates HR/admin accounts directly from the platform (relayed to
// the manage-users Edge Function).
export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(
    createMember,
    initialState
  );
  const t = ar.settingsPage.addMember;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h3 className="font-semibold">{t.title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="member_full_name">{t.fullName}</Label>
          <Input
            id="member_full_name"
            name="full_name"
            required
            minLength={2}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member_email">{t.email}</Label>
          <Input
            id="member_email"
            name="email"
            type="email"
            required
            dir="ltr"
            className="text-start"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member_password">{t.password}</Label>
          <Input
            id="member_password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            dir="ltr"
            className="text-start"
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">{t.passwordHint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member_role">{t.role}</Label>
          <select
            id="member_role"
            name="role"
            defaultValue="hr"
            className={selectClass + " h-9"}
          >
            <option value="hr">{ar.admin.roles.hr}</option>
            <option value="admin">{ar.admin.roles.admin}</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.creating : t.submit}
        </Button>
        {state.saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" aria-hidden />
            {t.created}
          </span>
        )}
        {state.error && !pending && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}

// The preferred way to add a colleague (S2): they set their own password and
// the invitation is bound to their email address on acceptance, so no admin
// ever handles someone else's credentials.
export function InviteMemberForm({
  canAssignOwner,
}: {
  canAssignOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    inviteMember,
    initialState
  );
  const t = ar.settingsPage.invite;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.hint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite_email">{t.email}</Label>
          <Input
            id="invite_email"
            name="email"
            type="email"
            required
            maxLength={200}
            dir="ltr"
            className="text-start"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite_role">{t.role}</Label>
          <select
            id="invite_role"
            name="role"
            defaultValue="hr"
            className={selectClass}
          >
            <option value="viewer">{ar.admin.roles.viewer}</option>
            <option value="hr">{ar.admin.roles.hr}</option>
            <option value="admin">{ar.admin.roles.admin}</option>
            {canAssignOwner && (
              <option value="owner">{ar.admin.roles.owner}</option>
            )}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          <Mail className="size-4" aria-hidden />
          {pending ? t.sending : t.submit}
        </Button>
      </div>
      {!pending && state.saved && (
        <span className="flex items-center gap-1 text-sm text-emerald-600">
          <Check className="size-4" aria-hidden />
          {t.sent}
        </span>
      )}
      {!pending && state.error && (
        <span className="text-sm text-destructive">{state.error}</span>
      )}
    </form>
  );
}

export function RevokeInvitationButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await revokeInvitation(id);
        setPending(false);
      }}
    >
      <X className="size-3.5" aria-hidden />
      {ar.settingsPage.invite.revoke}
    </Button>
  );
}
