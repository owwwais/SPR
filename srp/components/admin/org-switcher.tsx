"use client";

import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { switchOrganization } from "@/app/(dashboard)/admin/org-actions";
import { ar } from "@/lib/i18n/ar";
import type { MemberRole } from "@/types/database";

type Membership = {
  orgId: string;
  slug: string;
  name: string;
  role: MemberRole;
};

// A user belonging to exactly one organization (the common case) sees a plain
// label, not a control that does nothing.
export function OrgSwitcher({
  current,
  memberships,
}: {
  current: { id: string; name: string };
  memberships: Membership[];
}) {
  const [open, setOpen] = useState(false);

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 font-semibold">
        <Building2 className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{current.name}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start font-semibold transition-colors hover:bg-accent"
      >
        <Building2 className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown
          className="ms-auto size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
            {ar.admin.switcher.label}
          </p>
          {memberships.map((membership) => (
            <form key={membership.orgId} action={switchOrganization}>
              <input type="hidden" name="org_id" value={membership.orgId} />
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-accent"
              >
                <span className="truncate">{membership.name}</span>
                <span className="ms-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {ar.admin.roles[membership.role]}
                  </span>
                  {membership.orgId === current.id && (
                    <Check className="size-4 text-primary" aria-hidden />
                  )}
                </span>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
