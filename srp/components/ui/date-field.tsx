"use client";

import { useState } from "react";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";

// An Arabic date input (UI-D2). <input type="date"> renders the browser's own
// format — "mm/dd/yyyy" for most visitors — whatever the page language is.
// Three selects with our own Arabic labels say the same thing in Arabic and
// work with a thumb. The value still travels as one hidden YYYY-MM-DD field
// (or "" when unset), so the form's server action does not change.

const selectClass =
  "h-9 min-w-0 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25";

function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function DateField({
  id,
  name,
  defaultValue,
  years = 3,
  onValueChange,
}: {
  /** Given to the day select, so a <Label htmlFor> lands on it. */
  id: string;
  /** Omit when the parent owns the value (onValueChange) and posts it itself. */
  name?: string;
  /** YYYY-MM-DD */
  defaultValue?: string | null;
  /** How many years from the current one the year list offers. */
  years?: number;
  /** Called with "YYYY-MM-DD", or "" while incomplete. */
  onValueChange?: (value: string) => void;
}) {
  const t = ar.common.dateField;
  const [initialYear, initialMonth, initialDay] = (defaultValue ?? "").split("-");
  const [year, setYear] = useState(initialYear ?? "");
  const [month, setMonth] = useState(initialMonth ?? "");
  const [day, setDay] = useState(initialDay ?? "");

  const thisYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: years }, (_, i) => String(thisYear + i));
  // A saved date in a year outside the list must still show.
  if (initialYear && !yearOptions.includes(initialYear)) yearOptions.unshift(initialYear);

  const clamp = (y: string, m: string, d: string) => {
    const max = y && m ? daysIn(Number(y), Number(m)) : 31;
    return d && Number(d) > max ? String(max).padStart(2, "0") : d;
  };
  const maxDay = year && month ? daysIn(Number(year), Number(month)) : 31;
  const safeDay = clamp(year, month, day);
  const value = year && month && safeDay ? `${year}-${month}-${safeDay}` : "";

  function change(next: { y?: string; m?: string; d?: string }) {
    const y = next.y ?? year;
    const m = next.m ?? month;
    const d = clamp(y, m, next.d ?? day);
    if (next.y !== undefined) setYear(y);
    if (next.m !== undefined) setMonth(m);
    if (next.d !== undefined) setDay(d);
    onValueChange?.(y && m && d ? `${y}-${m}-${d}` : "");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] gap-2">
        <select
          id={id}
          aria-label={t.day}
          value={safeDay}
          onChange={(e) => change({ d: e.target.value })}
          className={selectClass}
        >
          <option value="">{t.day}</option>
          {Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={t.month}
          value={month}
          onChange={(e) => change({ m: e.target.value })}
          className={selectClass}
        >
          <option value="">{t.month}</option>
          {ar.common.months.map((label, i) => (
            <option key={label} value={String(i + 1).padStart(2, "0")}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={t.year}
          value={year}
          onChange={(e) => change({ y: e.target.value })}
          className={selectClass}
        >
          <option value="">{t.year}</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => {
          setDay("");
          setMonth("");
          setYear("");
          onValueChange?.("");
        }}
        className={cn(
          "w-fit text-xs text-muted-foreground hover:text-foreground",
          !(day || month || year) && "invisible"
        )}
      >
        {t.clear}
      </button>
    </div>
  );
}
