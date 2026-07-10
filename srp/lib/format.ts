import { format } from "date-fns";
import { arSA } from "date-fns/locale";

export function formatDate(value: string) {
  return format(new Date(value), "d MMMM yyyy", { locale: arSA });
}

export function formatDateTime(value: string) {
  return format(new Date(value), "d MMMM yyyy، h:mm a", { locale: arSA });
}

// Local date as YYYY-MM-DD (matches Postgres `current_date` semantics used
// by the application-insert RLS policy better than UTC ISO slicing).
export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}
